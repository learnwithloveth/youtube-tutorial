import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Tables owned by the identity module.
 *
 * Module-local, prefixed `id_`. No other module may read them: Ledger and Trading
 * hold a `UserId` and nothing more. That is what allows identity to be lifted into
 * its own service — the tables travel with it, and the rest of the system only ever
 * held an opaque id.
 */

export const users = pgTable(
  'id_users',
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
  (table) => [uniqueIndex('id_users_email_uq').on(table.email)],
);

export const sessions = pgTable(
  'id_sessions',
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
    index('id_sessions_user_idx').on(table.userId, table.revokedAt),
    // Drives the expiry sweep on an index rather than a table scan.
    index('id_sessions_expires_idx').on(table.expiresAt),
  ],
);

export const verificationTokens = pgTable(
  'id_verification_tokens',
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
    uniqueIndex('id_verification_tokens_hash_uq').on(table.tokenHash),
    // Covers superseding a user's outstanding tokens when a new one is issued.
    index('id_verification_tokens_user_idx').on(table.userId, table.purpose, table.consumedAt),
    // Drives the expiry sweep on an index rather than a table scan.
    index('id_verification_tokens_expires_idx').on(table.expiresAt),
  ],
);
