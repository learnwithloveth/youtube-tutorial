import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { env } from '../env';
import * as schema from './schema';

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
 */

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

/** Returns the database handle, or null when none is configured. */
export function db(): Database | null {
  if (cached) return cached;

  const url = env().DATABASE_URL;
  if (!url) return null;

  cached = drizzle(neon(url), { schema });
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

export { schema };
