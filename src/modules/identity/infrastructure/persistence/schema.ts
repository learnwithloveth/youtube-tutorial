import {
  customType,
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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

    /**
     * Ten digits, shown to the account holder and typed by an operator.
     *
     * A column on `users` rather than on `profiles`, although it is the field a
     * person reads: a profile row is created on demand and most accounts never
     * have one, and an identifier that exists for some accounts is not an
     * identifier. It is also assigned once and never edited, which is the opposite
     * of everything in `profiles`.
     *
     * The unique index is the real arbiter, exactly as the email one is — the
     * application checks a candidate first, but two registrations can draw the
     * same number between that check and the insert.
     */
    accountNumber: text('account_number').notNull(),

    /**
     * Self-describing scrypt output: algorithm, parameters, salt, key.
     *
     * Nullable since Google sign-in: an account created through a provider has no
     * password until its owner sets one. It is not filled with a random hash to
     * keep the column `not null` — see `UserProps.passwordHash` for why that
     * shortcut costs more than it saves.
     */
    passwordHash: text('password_hash'),

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
  (table) => [
    uniqueIndex('users_email_uq').on(table.email),
    uniqueIndex('users_account_number_uq').on(table.accountNumber),
  ],
);

/**
 * How an account holder appears: a display name and a handle.
 *
 * ── Its own table, not columns on `users` ─────────────────────────────────────
 * `users` is the credential: the hash, the lockout counter, the role. It is read
 * on every authentication and it is the row a security review looks at hardest.
 * A display name is read on every *page render*, changes whenever somebody feels
 * like it, and matters to nothing that decides access — so it is kept where an
 * edit to it cannot touch the other.
 *
 * The row is created on demand rather than at registration. Most accounts will
 * never set either field, and a table of empty rows is one every query has to
 * outer-join around for nothing.
 */
export const profiles = identitySchema.table(
  'profiles',
  {
    /** Also the primary key: exactly one profile per account, enforced by the shape. */
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The name given at sign-up. Null for accounts that arrived another way. */
    firstName: text('first_name'),
    lastName: text('last_name'),

    displayName: text('display_name'),
    /** Stored without the leading `@`, which is punctuation the interface adds. */
    handle: text('handle'),

    /**
     * Country of residence, as the account holder gave it. ISO-3166-1 alpha-2.
     *
     * Not the country a request came from — sign-up offers that as a default and
     * this column keeps the answer, which is a different claim and the only one
     * worth storing.
     */
    country: text('country'),
    /** E.164, or null. Never a national number: see `PHONE_PATTERN`. */
    phone: text('phone'),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Optimistic-concurrency token, matching every other table in this schema. */
    version: integer('version').notNull().default(0),
  },
  (table) => [
    /*
     * Unique where present.
     *
     * A plain unique index would treat every unset handle as a value and let only
     * one account leave it blank — which is most of them. Postgres does not count
     * nulls as equal in a unique index, so this works as written; the index is
     * declared explicitly because the *intent* is "no two people share a handle",
     * and that intent is easy to break with a later `default ''`.
     */
    uniqueIndex('profiles_handle_uq').on(table.handle),
  ],
);

/**
 * Accounts at an external identity provider, linked to a local account.
 *
 * ── The primary key is the provider's own key ─────────────────────────────────
 * `(provider, provider_account_id)` as the primary key is what makes "one Google
 * account signs into exactly one Novex account" a rule the database enforces. The
 * second index enforces the other direction: one connected Google account per
 * user, so the security page never has to explain two.
 *
 * The address is a copy of what the provider reported at link time, kept for
 * display. It is deliberately not unique and never used to find a link — see
 * `domain/connected-account.ts`.
 */
export const connectedAccounts = identitySchema.table(
  'connected_accounts',
  {
    provider: text('provider', { enum: ['google'] }).notNull(),
    providerAccountId: text('provider_account_id').notNull(),

    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    email: text('email').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    uniqueIndex('connected_accounts_user_provider_uq').on(table.userId, table.provider),
  ],
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

/**
 * Identity documents, as bytes.
 *
 * ── Its own table, and the same trade-off the ledger made for deposit proofs ──
 * Bytes in Postgres need no credentials and are transactional with the submission,
 * so a verification and the document it rests on cannot diverge. They are also the
 * wrong home at volume — this project's tier is 512 MB in total — which is why the
 * application reaches them through a port and not through this table directly.
 *
 * Split from `verifications` so the queue can be listed without dragging four
 * megabytes per row across the wire. A list query never joins this.
 */
export const verificationDocuments = identitySchema.table('verification_documents', {
  id: text('id').primaryKey(),
  /** Sniffed from the bytes, never taken from the upload's declared type. */
  contentType: text('content_type', {
    enum: ['image/png', 'image/jpeg', 'image/webp'],
  }).notNull(),
  bytes: customType<{ data: Uint8Array; driverData: Buffer }>({
    dataType: () => 'bytea',
    toDriver: (value) => Buffer.from(value),
    fromDriver: (value) => new Uint8Array(value),
  })('bytes').notNull(),
  byteLength: integer('byte_length').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Identity verification submissions.
 *
 * One row per attempt, never updated in place after a decision: a rejected customer
 * submits again and that is a new row, so the table reads as the history of what was
 * claimed and what was decided rather than only the latest state.
 */
export const verifications = identitySchema.table(
  'verifications',
  {
    id: text('id').primaryKey(),

    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** As written on the document, which is not the display name on the account. */
    fullName: text('full_name').notNull(),
    /**
     * `date`, not `timestamp`. A birthday has no time of day, and storing one
     * invites a timezone conversion to move somebody's birthday by a day — which,
     * on the field an age check reads, is the difference between accepted and
     * refused for anybody born within a day of the threshold.
     */
    dateOfBirth: date('date_of_birth').notNull(),
    /** ISO 3166-1 alpha-2, upper case. */
    country: text('country').notNull(),

    documentType: text('document_type', {
      enum: ['passport', 'national-id', 'drivers-licence'],
    }).notNull(),
    documentNumber: text('document_number').notNull(),
    documentId: text('document_id')
      .notNull()
      .references(() => verificationDocuments.id),

    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    /** Required on a rejection. The customer is shown it. */
    reason: text('reason'),

    /** Optimistic-concurrency token, matching every other table in this schema. */
    version: integer('version').notNull().default(0),
  },
  (table) => [
    /*
     * The queue's own index: pending first, oldest first within it.
     *
     * A review queue is worked oldest-first so nobody waits forever, which is the
     * opposite order to every other feed in this codebase and the reason this is
     * not the same index as a history would want.
     */
    index('verifications_queue_idx').on(table.status, table.submittedAt),
    /* "What has this account submitted before" — the first question on any repeat. */
    index('verifications_user_idx').on(table.userId, table.submittedAt),
  ],
);

export type VerificationRow = typeof verifications.$inferSelect;
export type VerificationDocumentRow = typeof verificationDocuments.$inferSelect;
