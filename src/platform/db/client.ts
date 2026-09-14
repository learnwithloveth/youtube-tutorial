import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { env } from '../env';

/**
 * Database handle.
 *
 * Created lazily and memoised, rather than at module load, for two reasons: a
 * build that imports this module must not need a live `DATABASE_URL`, and the
 * marketing pages that never touch the database should not pay to construct a
 * client.
 *
 * The Neon HTTP driver is used instead of a TCP pool because this app runs in a
 * serverless environment where connections are not reused between invocations.
 * A pool there is a liability: it holds sockets a function instance will never
 * get back to, and exhausts the server's connection limit under load.
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

let cached: Database | null = null;

/** Returns the database handle, or null when none is configured. */
export function db(): Database | null {
  if (cached) return cached;

  const url = env().DATABASE_URL;
  if (!url) return null;

  cached = drizzle(neon(url));
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
