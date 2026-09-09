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

  /**
   * Root secret for session sealing and keyed digests, both HKDF-derived from it.
   *
   * Required in production and validated at 32 characters, because the sealer
   * refuses a shorter one — better to fail at boot than on the first login. In
   * development a generated fallback keeps a fresh clone runnable; see `env()`.
   */
  SESSION_SECRET: z.string().min(32).optional(),

  /** Origin used to build the links in outbound mail. */
  APP_URL: z.url().default('http://localhost:3000'),

  /**
   * SMTP transport. Absent means messages are logged instead of sent, so a clone
   * with no `docker compose up` still completes a signup and prints the link.
   */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).default('Novex <no-reply@novex.io>'),
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

/**
 * A development-only session secret, derived so it is stable across reloads.
 *
 * Without this, a fresh clone cannot sign in until someone reads the README, and
 * a per-process random value would invalidate every session on every hot reload.
 * It is refused in production: a predictable secret there would let anyone forge
 * a session cookie.
 */
const DEV_SESSION_SECRET = 'novex-development-session-secret-do-not-use-in-production';

export function sessionSecret(): string {
  const config = env();
  if (config.SESSION_SECRET) return config.SESSION_SECRET;

  if (config.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is required in production. Generate one with: openssl rand -base64 32',
    );
  }
  return DEV_SESSION_SECRET;
}

/** SMTP settings, or null when no host is configured. */
export function smtpConfig(): {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
} | null {
  const config = env();
  if (!config.SMTP_HOST) return null;

  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    user: config.SMTP_USER,
    password: config.SMTP_PASSWORD,
    from: config.SMTP_FROM,
  };
}
