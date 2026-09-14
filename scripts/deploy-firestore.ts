import { readFileSync } from 'node:fs';

import { config } from 'dotenv';
import { cert, initializeApp } from 'firebase-admin/app';

// Next.js reads `.env.local` automatically; a script run through `tsx` does not,
// so the same file has to be loaded explicitly — exactly as `grant-admin.ts` and
// `drizzle.config.ts` already do. Without it the service account reads as absent
// and this refuses to deploy to a project it cannot see.
//
// Before anything that reads the environment: `env()` caches on first access, so
// a module that asked earlier would pin the empty values for the whole process.
config({ path: '.env.local' });

/**
 * Publishes `firestore.rules` and `firestore.indexes.json` to the project.
 *
 * ── Why a script and not the Firebase CLI ──────────────────────────────────────
 * `firebase deploy` needs an interactive browser login, or a CI token that is a
 * second credential to issue and store. The service account this application
 * already holds can do the same job through the REST APIs, so there is nothing
 * extra to provision and nothing extra to leak.
 *
 * ── The rules are not optional ─────────────────────────────────────────────────
 * A Firestore database created in production mode denies every read, and the chat
 * reads directly from the browser — so without this the widget connects, is
 * refused, and shows an empty thread with no error anyone will understand. A
 * database created in *test* mode is worse: it is world-readable until the trial
 * expires, and this publishes the rules that close it.
 *
 * Re-runnable. Publishing an identical ruleset creates a new version and releases
 * it; creating an index that already exists is reported and skipped.
 *
 *   pnpm firebase:deploy
 */

const RULES_FILE = 'firestore.rules';
const INDEX_FILE = 'firestore.indexes.json';

interface IndexSpec {
  collectionGroup: string;
  queryScope: string;
  fields: { fieldPath: string; order?: string }[];
}

async function main(): Promise<void> {
  // Imported here rather than at the top, for the reason the other scripts do it:
  // a static import is hoisted and evaluated before `config()` above has run.
  const { firebaseServiceAccount } = await import('../src/platform/env/index.js');

  const account = firebaseServiceAccount();
  if (account === null) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not set. Nothing to deploy to — see .env.example.',
    );
  }

  const app = initializeApp({ credential: cert(account) }, 'deploy');
  const credential = app.options.credential;
  if (credential === undefined) throw new Error('No credential on the initialised app');

  const accessToken = (await credential.getAccessToken()).access_token;
  const project = account.projectId;

  const authed = async (url: string, init: RequestInit): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
    });

  // ── Rules ────────────────────────────────────────────────────────────────
  // Two steps by design: a ruleset is created and *then* released. That is what
  // makes a bad deploy recoverable — the previous ruleset still exists and the
  // release can be pointed back at it.
  const source = readFileSync(RULES_FILE, 'utf8');

  const ruleset = await authed(
    `https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,
    {
      method: 'POST',
      body: JSON.stringify({
        source: { files: [{ name: RULES_FILE, content: source }] },
      }),
    },
  );

  if (!ruleset.ok) {
    throw new Error(`Creating the ruleset failed (${ruleset.status}): ${await ruleset.text()}`);
  }

  const { name } = (await ruleset.json()) as { name: string };

  // The release points a well-known name — `cloud.firestore` is the one Firestore
  // reads — at a ruleset. Publishing without this leaves the new rules stored and
  // unused, which is the failure that looks like success.
  const releaseName = `projects/${project}/releases/cloud.firestore`;

  // `updateMask` travels in the *body* here, alongside a wrapped `release` object.
  // This is not the usual Google convention of a query parameter and a bare
  // resource — sending it that way is rejected with "Unknown name rulesetName".
  let release = await authed(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
    method: 'PATCH',
    body: JSON.stringify({
      release: { name: releaseName, rulesetName: name },
      updateMask: 'rulesetName',
    }),
  });

  // A project whose rules have never been published has nothing to update yet, so
  // the first deploy creates the release instead. Every later one patches it.
  if (release.status === 404) {
    release = await authed(
      `https://firebaserules.googleapis.com/v1/projects/${project}/releases`,
      { method: 'POST', body: JSON.stringify({ name: releaseName, rulesetName: name }) },
    );
  }

  if (!release.ok) {
    throw new Error(`Releasing the ruleset failed (${release.status}): ${await release.text()}`);
  }

  console.log(`rules     : published and released (${name.split('/').pop()})`);

  // ── Indexes ──────────────────────────────────────────────────────────────
  const declared = JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as { indexes: IndexSpec[] };

  let created = 0;
  let existing = 0;
  let forbidden = false;
  const failed: IndexSpec[] = [];
  // Kept so an unexpected refusal prints what the API actually said. Reporting only
  // the status code turns a one-line diagnosis into an afternoon.
  let firstError = '';

  for (const index of declared.indexes) {
    const response = await authed(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`,
      {
        method: 'POST',
        body: JSON.stringify({
          queryScope: index.queryScope,
          fields: index.fields.map((field) => ({
            fieldPath: field.fieldPath,
            order: field.order ?? 'ASCENDING',
          })),
        }),
      },
    );

    if (response.ok) {
      created += 1;
      continue;
    }

    const body = await response.text();
    // An index that is already there is the expected result of a second run, not
    // a failure.
    if (response.status === 409 || body.includes('already exists')) {
      existing += 1;
      continue;
    }

    // Every index is attempted rather than stopping at the first refusal. They
    // fail for the same reason or not at all, and a run that reports one of four
    // leaves the operator guessing how much work is left.
    if (response.status === 403) forbidden = true;
    if (firstError === '') firstError = `${response.status} ${body.trim()}`;
    failed.push(index);
  }

  console.log(`indexes   : ${created} created, ${existing} already present, ${failed.length} refused`);

  if (created > 0) {
    console.log('note      : new indexes build in the background; queries using them fail until they finish.');
  }

  if (failed.length === 0) return;

  if (forbidden) {
    // The Firebase Admin SDK service account can publish rules but cannot
    // administer indexes: that needs `datastore.indexes.create`, which lives in a
    // role it is not granted by default. Saying so beats "The caller does not have
    // permission", which is true and tells nobody what to do about it.
    console.error('');
    console.error('The service account may publish rules but not create indexes.');
    console.error('Grant it the narrow role once, then re-run this command:');
    console.error('');
    console.error(`  https://console.cloud.google.com/iam-admin/iam?project=${project}`);
    console.error('  → find the principal ending in @' + project + '.iam.gserviceaccount.com');
    console.error('  → Edit → Add another role → "Cloud Datastore Index Admin"');
    console.error('');
    // Said explicitly because it looks exactly like the grant not working, and the
    // obvious response — granting something broader — fixes nothing and leaves a
    // service account with more access than it needs.
    console.error('If the role is already there, wait a minute and run it again:');
    console.error('an IAM grant takes up to a few minutes to reach every service.');
    console.error('');
    console.error('Or create them by hand in the Firebase console — Firestore → Indexes →');
    console.error('Composite → Add index, with these fields:');
  } else {
    console.error('');
    console.error(`These indexes could not be created (${firstError}):`);
  }

  for (const index of failed) {
    const fields = index.fields
      .map((field) => `${field.fieldPath} ${(field.order ?? 'ASCENDING') === 'ASCENDING' ? 'Asc' : 'Desc'}`)
      .join(', ');
    console.error(`  ${index.collectionGroup}: ${fields}`);
  }

  console.error('');
  console.error('Until they exist, the queries that need them fail — Firestore refuses a');
  console.error('composite query with no index rather than running it slowly. The browser');
  console.error('console also prints a one-click creation link the first time one is hit.');

  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
