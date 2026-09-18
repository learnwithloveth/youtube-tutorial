import { config } from 'dotenv';

// Same as `drizzle.config.ts`: a script run through tsx does not read `.env.local`
// on its own, and this must target the database the CLI would have targeted.
config({ path: '.env.local' });

/**
 * `pnpm db:migrate`, with the error left in.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * `drizzle-kit migrate` renders its progress with a spinner, and when a migration
 * throws, the spinner's redraw takes the error with it. What is left is:
 *
 *     Using 'pg' driver for database querying
 *     [⣻] applying migrations... ELIFECYCLE  Command failed with exit code 1.
 *
 * — which says that something failed, and nothing whatsoever about what. The
 * migrator underneath is an ordinary function that throws an ordinary error, so
 * calling it directly and printing what it throws is the whole fix.
 *
 * This runs the *same* migrations from the *same* folder against the *same*
 * journal table, so it is not a different path that might behave differently: it
 * is the identical operation with the output turned back on. Either use it to
 * diagnose and then go back to `pnpm db:migrate`, or just use this.
 *
 *   node --import tsx scripts/migrate-verbose.ts
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Check .env.local.');

  // Imported here rather than at the top, for the reason the other scripts give:
  // a static import is hoisted above the `config()` call.
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { Client } = await import('pg');

  // Printed without the password: knowing *which* database was reached is half of
  // most migration failures, and the other half is below.
  console.log('target   :', url.replace(/:\/\/[^@]*@/, '://***@'));

  const client = new Client({ connectionString: url });
  await client.connect();

  const where = await client.query<{ db: string; user: string; server: string }>(
    'select current_database() as db, current_user as "user", version() as server',
  );
  console.log('database :', where.rows[0]?.db, 'as', where.rows[0]?.user);

  const applied = await client
    .query<{ n: string }>('select count(*) as n from drizzle.__drizzle_migrations')
    .then((result) => result.rows[0]?.n ?? '0')
    .catch(() => 'none — this database has never been migrated');
  console.log('applied  :', applied);

  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('result   : migrations applied successfully');
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error('\n─── the error drizzle-kit swallowed ───');

  // A `pg` error carries far more than its message: the failing statement, the
  // character position within it, and the constraint or column at fault. Printing
  // only `error.message` throws away the half that names the cause.
  const detail = error as {
    message?: string;
    code?: string;
    detail?: string;
    hint?: string;
    position?: string;
    schema?: string;
    table?: string;
    column?: string;
    constraint?: string;
    routine?: string;
    cause?: unknown;
  };

  for (const key of [
    'message',
    'code',
    'detail',
    'hint',
    'position',
    'schema',
    'table',
    'column',
    'constraint',
    'routine',
  ] as const) {
    if (detail[key] !== undefined) console.error(`${key.padEnd(11)}: ${String(detail[key])}`);
  }

  if (detail.cause !== undefined) console.error('cause      :', detail.cause);
  if (error instanceof Error && error.stack) console.error('\n', error.stack);

  process.exitCode = 1;
});
