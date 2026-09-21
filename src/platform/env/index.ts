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
  MESSAGE_HINT: z.string(),
  MESSAGE_LABEL: z.string(),
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

  /**
   * Seconds between scheduled ticker refreshes, on a server that stays up.
   *
   * Unset means no loop, which is correct for a serverless deployment: instances
   * sleep, so a timer inside one is not a schedule and a real cron against
   * `POST /api/market-data/refresh` is. Set it for `next dev`, a container or a
   * VM, where the alternative is quotes that only move when somebody visits.
   *
   * Floored at 30: the upstream's free tier is rate-limited per address, and a
   * tighter loop buys nothing — a quote is not considered stale until five
   * minutes have passed.
   */
  MARKET_DATA_REFRESH_INTERVAL_SECONDS: z.coerce.number().int().min(30).optional(),

  NEXT_PUBLIC_SITE_URL: z.url().default('https://novex.io'),

  /**
   * The site's name and description — the wordmark, page titles, meta tags, email
   * subjects.
   *
   * Listed here to be documented; they are *read* through `BRAND` in the content
   * module, because Client Components render the name and this module never reaches
   * a browser. The one reader here is `smtpConfig`, for the sender's name. `next.config.ts` inlines both into every bundle at
   * build time, so a change needs a restart or a rebuild. Unset or blank falls back
   * to the design's own name and description — not an error, because a blank name
   * has an obvious right answer and refusing to boot over it would not be one.
   */
  WEBSITE_NAME: z.string().optional(),
  WEBSITE_DESCRIPTION: z.string().optional(),

  /**
   * IP geolocation for the live-activity console.
   *
   * On by default. Locating a visitor from the connection is the point of the
   * presence feature — it is what works for the majority who will never grant the
   * browser anything — and a default of *off* meant the console shipped reporting
   * "not resolved" for every row until someone found this variable.
   *
   * Set `GEOIP_ENABLED=false` to turn it off, which is the right setting behind a
   * CDN that already attaches geo headers (those are tried first regardless, and
   * cost nothing), or anywhere sending addresses to a third party is unacceptable.
   * Locations then resolve from headers alone and honestly report `unavailable`
   * where there are none.
   */
  GEOIP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /**
   * An operator-supplied lookup endpoint, tried before the built-in free chain.
   *
   * For a paid plan or a self-hosted mirror. Parsed as ipapi.co's response shape,
   * which is what a paid ipapi key and most MaxMind wrappers already speak.
   */
  GEOIP_LOOKUP_URL: z.url().optional(),
  GEOIP_LOOKUP_KEY: z.string().min(1).optional(),

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
   * Firebase, for live support only.
   *
   * ── Why any of this is here ────────────────────────────────────────────────
   * Chat is the one thing in this application that genuinely needs a socket, and
   * a serverless deployment cannot hold one. Firestore is the realtime *read*
   * channel: browsers subscribe, the server writes through the Admin SDK, and
   * nothing else moves to Firebase. Presence, activity, identity and the ledger
   * stay in Postgres, where they can be joined to each other.
   *
   * ── The service account is the only secret ─────────────────────────────────
   * The `NEXT_PUBLIC_` values are *meant* to be public: Firebase ships them in
   * every browser bundle by design, and access is controlled by security rules,
   * not by hiding an API key. They are validated here anyway so a typo fails at
   * boot rather than as a silent `undefined` in the client config.
   *
   * All optional: a clone with no Firebase project must still run. The support
   * screens then report themselves unavailable rather than the app failing to
   * start, which is the same rule `DATABASE_URL` follows.
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1).optional(),
  /** The public half of the Web Push key pair. Safe in the bundle; it has to be. */
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().min(1).optional(),

  /**
   * Google sign-in. Both or neither.
   *
   * Absent is a supported configuration: the "Continue with Google" button is then
   * not rendered at all, rather than rendered and dead. The redirect URI is not a
   * variable — it is `APP_URL` + `/api/auth/google/callback`, because two places to
   * state the same origin is how the callback ends up registered at one and sent to
   * the other.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  /**
   * WalletConnect's relay, for pairing a phone wallet with a desktop browser.
   *
   * ── Public by design, and validated anyway ─────────────────────────────────
   * A `NEXT_PUBLIC_` value ships in every browser bundle. That is correct here:
   * a project id identifies the application to the relay and authorises nothing
   * — it is the same kind of value as the Firebase config above. It is listed
   * here so a typo fails at boot rather than as a pairing that silently never
   * completes.
   *
   * ── Absent is a supported configuration ────────────────────────────────────
   * Unset, the QR option is not rendered at all, and connecting still works
   * through a browser extension or a wallet's own in-app browser. A relay that
   * cannot pair would produce a QR code somebody stands there scanning, which is
   * worse than not offering one. Get a free id at https://dashboard.reown.com.
   */
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),

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
  /** Unset signs mail with the site's name — see `smtpConfig`. */
  SMTP_FROM: z.string().min(1).optional(),
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

/**
 * IP lookup settings, or null when geolocation is switched off.
 *
 * Null is a supported configuration, not a degraded one: the presence module then
 * composes its resolver chain without the HTTP adapter and reports `unavailable`
 * for any visitor whose location the network did not already reveal.
 *
 * `resolveOwnAddress` is what makes the board useful on a developer's machine. A
 * local request carries no client address, so there is nothing to look up; outside
 * production the module asks where *this* machine connects from instead, which on
 * a laptop is the same place the visitor is. See `IpLookupOptions` for why that is
 * refused in production.
 */
export function geoLookupConfig(): {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  resolveOwnAddress: boolean;
} | null {
  const config = env();
  if (!config.GEOIP_ENABLED) return null;

  return {
    baseUrl: config.GEOIP_LOOKUP_URL,
    apiKey: config.GEOIP_LOOKUP_KEY,
    resolveOwnAddress: config.NODE_ENV !== 'production',
  };
}

/**
 * The Firebase service account, parsed, or null when none is configured.
 *
 * ── Parsed here rather than where it is used ───────────────────────────────────
 * A malformed JSON blob in an environment variable is the kind of fault that
 * otherwise surfaces three layers down as "Cannot read properties of undefined",
 * long after the stack that could explain it has been discarded. This turns it
 * into one error naming the variable.
 *
 * The private key needs the newline repair. Environment files and most secret
 * managers cannot carry a literal newline, so the key arrives with `
` written
 * out as two characters — and the crypto layer rejects it with a message about
 * PEM formatting that says nothing about where the string came from.
 */
export function firebaseServiceAccount(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const raw = env().FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole downloaded key file as a single line.',
    );
  }

  const account = z
    .object({
      project_id: z.string().min(1),
      client_email: z.string().min(1),
      private_key: z.string().min(1),
    })
    .safeParse(parsed);

  if (!account.success) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key. Use the key downloaded from Project settings → Service accounts.',
    );
  }

  return {
    projectId: account.data.project_id,
    clientEmail: account.data.client_email,
    privateKey: account.data.private_key.replace(/\\n/g, '\n'),
  };
}

/**
 * Google OAuth settings, or null when the client is not configured.
 *
 * Null is what makes the sign-in button disappear rather than fail. Both halves are
 * required together: a client id with no secret cannot complete an exchange, and
 * finding that out at the callback — after the person has already consented — is
 * the worst possible moment.
 */
export function googleOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const config = env();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return null;

  return {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: `${config.APP_URL.replace(/\/+$/, '')}/api/auth/google/callback`,
  };
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
    // The sender's display name follows the site's unless SMTP_FROM pins one, so a
    // renamed deployment does not go on signing its mail as the old name. Built from
    // WEBSITE_NAME here rather than from BRAND, which this layer may not import; the
    // fallback matches the one in `modules/content/infrastructure/brand.ts`.
    from: config.SMTP_FROM ?? `${config.WEBSITE_NAME?.trim() || 'Novex'} <no-reply@novex.io>`,
  };
}

export function messageConfig(): {
  messageHint: string;
  messageLabel: string;
} | null {
  const config = env();

  return {
    messageHint: config.MESSAGE_HINT,
    messageLabel: config.MESSAGE_LABEL,
  };
}
