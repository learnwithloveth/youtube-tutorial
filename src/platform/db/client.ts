import 'server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../env';
import { logger } from '../observability/logger';

/**
 * Database handle.
 *
 * Created lazily and memoised, rather than at module load, for two reasons: a
 * build that imports this module must not need a live `DATABASE_URL`, and the
 * marketing pages that never touch the database should not pay to construct a
 * client.
 *
 * ── Any Postgres, over the ordinary wire protocol ──────────────────────────
 * `pg` connects to whatever `DATABASE_URL` names: a local server, a container, or
 * a hosted provider. The Neon HTTP driver used before it sent each query as an
 * HTTPS request, which only Neon answers, so a local database could not be used at
 * all. It also had no interactive transactions, which the ledger needs in order to
 * roll back a conflicting transfer — see `DrizzleLedgerRepository.post`.
 *
 * A pool holds sockets, and on a serverless host each instance holds its own. There,
 * point `DATABASE_URL` at the provider's pooled endpoint (Neon's `-pooler` host,
 * for example) so the instances share a bounded set of server connections. Idle
 * clients close after ten seconds, which also drains a pool left behind by a
 * development reload.
 *
 * ── No schema is registered, deliberately ──────────────────────────────────
 * `drizzle(client, { schema })` exists to power the relational query API
 * (`db.query.users.findMany`). Registering one here would mean this file — the
 * shared foundation every module imports — enumerating every module's tables,
 * which is the dependency `platform-is-a-leaf` forbids, pointing the wrong way.
 *
 * Each module imports its own tables and uses `db.select().from(table)`, which
 * needs no registration. The cost is that `db.query.*` is unavailable; the gain is
 * that `platform` knows nothing about any bounded context, which is the property
 * that lets any of them be extracted.
 */

export type Database = ReturnType<typeof drizzle>;

/** The handle passed to `db.transaction()`, for writes that must commit together. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

let cached: Database | null = null;

/** Returns the database handle, or null when none is configured. */
export function db(): Database | null {
  if (cached) return cached;

  const url = env().DATABASE_URL;
  if (!url) return null;

  const pool = new Pool({
    connectionString: url,
    // Lets a script exit once its queries finish, instead of waiting out the idle
    // timeout. A server is kept alive by its own listener, so it is unaffected.
    allowExitOnIdle: true,
  });

  // An idle client whose connection drops (a database restart, a network blip) is
  // reported here. With no listener, Node treats it as an unhandled `error` event
  // and exits the process. The pool has already discarded that client and opens a
  // new one for the next query, so logging it is all that is needed.
  pool.on('error', (error) => {
    logger.error({ event: 'database_pool_error', module: 'platform' }, error);
  });

  cached = drizzle(pool);
  return cached;
}

/**
 * Returns the database handle, throwing when none is configured.
 *
 * For write paths and jobs, where running without a database is a
 * misconfiguration rather than a state to degrade through.
 */
export function requireDb(): Database {
  const handle = db();
  if (!handle) {
    throw new Error(
      'DATABASE_URL is not set. This code path requires a database; set it in .env.local.',
    );
  }
  return handle;
}
