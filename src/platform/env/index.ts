import 'server-only';

import { z } from 'zod';

/**
 * Environment validation, done once at first access.
 *
 * The failure this prevents is the one that costs the most to diagnose: a
 * missing or malformed variable that surfaces hours later as `undefined` deep
 * inside a query, or — worse — as a connection to the wrong database. Parsing
 * the whole environment against a schema turns that into a single, explicit
 * error naming the variable.
 *
 * `server-only` at the top is load-bearing. It makes the build fail if this
 * module is ever pulled into a Client Component bundle, which is the mechanism
 * that keeps `DATABASE_URL` and `SESSION_SECRET` off the browser.
 */

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Postgres connection string. Optional by design: the marketing site renders
   * its full catalogue without a database, and a missing URL should degrade the
   * price areas rather than take the site down.
   */
  DATABASE_URL: z.url().optional(),

  /** Shared secret required by POST /api/market-data/refresh. */
  MARKET_DATA_REFRESH_TOKEN: z.string().min(16).optional(),

  /** Upstream price feed. Overridable so tests can point at a local stub. */
  MARKET_DATA_FEED_URL: z.url().default('https://api.coingecko.com/api/v3'),
  MARKET_DATA_FEED_API_KEY: z.string().min(1).optional(),

  NEXT_PUBLIC_SITE_URL: z.url().default('https://novex.io'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Whether a database is configured. Read paths branch on this to degrade. */
export function hasDatabase(): boolean {
  return Boolean(env().DATABASE_URL);
}
