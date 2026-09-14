import { index, integer, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Tables owned by the identity module.
 *
 * ── A Postgres schema, not a name prefix ──────────────────────────────────────
 * These tables were once `public.id_users`, `public.id_sessions` and so on. The
 * prefix was a namespace simulated in a string, which Postgres already provides
 * properly — and `id_` was a poor choice of string besides, since `id` means
 * *identifier* everywhere else in a database and `id_users` reads as "the id of
 * users".
 *
 * A real schema buys three things a prefix cannot:
 *
 *  1. **Enforceable isolation.** `REVOKE ALL ON SCHEMA identity FROM app_reader`
 *     is a grant the database applies. "Do not read tables starting with id_" is a
 *     code review comment.
 *  2. **Extraction as a dump.** `pg_dump --schema=identity` is the whole module,
 *     with its indexes, constraints and future tables. That is the seam the module
 *     boundary exists to preserve, made operational.
 *  3. **Names that read.** `identity.users` says what it is. A reader does not
 *     have to know the prefix convention to parse it.
 *
 * The rule the boundary enforces is unchanged: no other context reads these. Every
 * other module holds an opaque `UserId` and nothing more.
 */

export const identitySchema = pgSchema('identity');

export const users = identitySchema.table(
  'users',
  {
    id: text('id').primaryKey(),

    /**
     * Stored already normalised (trimmed, lowercased) by the EmailAddress value
     * object. The unique index is therefore the real registration race-winner: two
     * concurrent signups for the same address both pass any prior read check, and
     * only the index can make exactly one of them succeed.
     */
    email: text('email').notNull(),

    /** Self-describing scrypt output: algorithm, parameters, salt, key. */
    passwordHash: text('password_hash').notNull(),

    status: text('status', { enum: ['active', 'locked', 'disabled'] })
      .notNull()
      .default('active'),

    /** Access tier. Granted administratively, never by registration. */
    role: text('role', { enum: ['customer', 'admin'] })
      .notNull()
      .default('customer'),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Optimistic-concurrency token. */
    version: integer('version').notNull().default(0),
  },
  (table) => [uniqueIndex('users_email_uq').on(table.email)],
);

export const sessions = identitySchema.table(
  'sessions',
  {
    /**
     * The raw session id. It is never exposed: the cookie carries an AES-GCM sealed
     * form, so a database leak alone does not yield usable cookies.
     */
    id: text('id').primaryKey(),

    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Last proof of identity — drives the step-up window for money movement. */
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true }).notNull(),

    /**
     * Set rather than deleted, so revocation is auditable: "when was this session
     * killed, and was it before or after the disputed action?"
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    // Keyed digests, never raw values. An unkeyed hash of an IPv4 address is
    // brute-forceable in seconds.
    userAgentHash: text('user_agent_hash'),
    ipHash: text('ip_hash'),
  },
  (table) => [
    // Covers "log out all devices" and the active-session list.
    index('sessions_user_idx').on(table.userId, table.revokedAt),
    // Drives the expiry sweep on an index rather than a table scan.
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);

export const verificationTokens = identitySchema.table(
  'verification_tokens',
  {
    id: text('id').primaryKey(),

    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** What the token authorises. Scoped so one purpose cannot be replayed as another. */
    purpose: text('purpose', { enum: ['email-verification', 'password-reset'] }).notNull(),

    /**
     * SHA-256 of the token, never the token.
     *
     * Unique, so the digest is both the lookup key and a guarantee that one token
     * maps to one row. A database leak yields digests an attacker cannot invert
     * into working links.
     */
    tokenHash: text('token_hash').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Set rather than deleted, so a replay attempt is visible in an audit. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('verification_tokens_hash_uq').on(table.tokenHash),
    // Covers superseding a user's outstanding tokens when a new one is issued.
    index('verification_tokens_user_idx').on(table.userId, table.purpose, table.consumedAt),
    // Drives the expiry sweep on an index rather than a table scan.
    index('verification_tokens_expires_idx').on(table.expiresAt),
  ],
);
