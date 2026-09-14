'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * The browser's Firebase handle.
 *
 * ── Every key here is public, and that is not a mistake ────────────────────────
 * Firebase ships these in the client bundle by design. They identify the project;
 * they do not authorise anything. Access is decided by the security rules and by
 * the custom token this application mints from a real session — so a leaked
 * `apiKey` buys an attacker the ability to open a connection and be refused.
 *
 * Treating them as secrets is the mistake that leads somewhere worse: hiding them
 * behind a server route, which means proxying every realtime update and giving up
 * the only reason Firestore is here.
 *
 * ── Read as static property paths, deliberately ────────────────────────────────
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when it can see
 * the whole expression. Destructuring `process.env` or indexing it with a variable
 * produces `undefined` in the browser with no warning anywhere, which is a long
 * afternoon. Hence the repetition below.
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const SENDER_ID = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';

const APP_NAME = 'novex';

/** Null when the build carried no Firebase config. Callers render an absence. */
export function firebaseApp(): FirebaseApp | null {
  if (!API_KEY || !PROJECT_ID || !APP_ID) return null;

  // Looked up by name before creating. A hot reload re-evaluates this module while
  // the previous app is still in the SDK's registry, and `initializeApp` throws on
  // a duplicate name.
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  return initializeApp(
    {
      apiKey: API_KEY,
      authDomain: AUTH_DOMAIN,
      projectId: PROJECT_ID,
      appId: APP_ID,
      messagingSenderId: SENDER_ID,
    },
    APP_NAME,
  );
}

export function firebaseDb(): Firestore | null {
  const app = firebaseApp();
  return app === null ? null : getFirestore(app);
}

export function firebaseAuth(): Auth | null {
  const app = firebaseApp();
  return app === null ? null : getAuth(app);
}

/**
 * Exchanges this application's session for a Firestore identity.
 *
 * Returns why it failed rather than a bare false, because the caller has to tell
 * somebody — and the most common cause is a project setting, not a fault.
 */
export type SignInOutcome =
  | { readonly ok: true }
  /**
   * Why it failed, in words a developer can act on.
   *
   * Not for a customer — they see "reconnecting" and nothing about Firebase. This
   * exists because the operator console is a developer-facing surface and the most
   * common cause of a dead listener is a project setting nobody has flipped.
   * "Live updates unavailable" sends somebody reading network traces; naming the
   * switch takes thirty seconds.
   */
  | { readonly ok: false; readonly reason: string };

export async function signInToFirebase(): Promise<SignInOutcome> {
  const auth = firebaseAuth();
  if (auth === null) return { ok: false, reason: 'No Firebase project is configured.' };

  let response: Response;
  try {
    response = await fetch('/api/support/session', { method: 'POST', cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'Could not reach the server to get a token.' };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason:
        response.status === 401
          ? 'Not signed in.'
          : `The token endpoint answered ${response.status}.`,
    };
  }

  const { token, uid } = (await response.json()) as { token: string; uid: string };

  // Idempotent by uid: already signed in as the right person is a no-op, which
  // matters because a page with two subscribing components would otherwise race two
  // sign-ins and the loser's listeners would be torn down mid-snapshot.
  if (auth.currentUser?.uid === uid) return { ok: true };

  try {
    await signInWithCustomToken(auth, token);
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    // The one that looks like a bug and is a setting. Firebase answers
    // CONFIGURATION_NOT_FOUND when a project has never had Authentication turned
    // on — the server can still *mint* a token, because that is only signing a
    // JWT, so everything looks healthy until the browser tries to redeem it.
    if (code === 'auth/configuration-not-found') {
      return {
        ok: false,
        reason:
          'Firebase Authentication is not enabled on this project. Enable it in the Firebase console — Authentication → Get started. No sign-in provider is needed.',
      };
    }
    return { ok: false, reason: `Sign-in was refused (${code || 'unknown'}).` };
  }
}
