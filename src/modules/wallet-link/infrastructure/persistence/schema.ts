import {
  customType,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Tables owned by the wallet-link module.
 *
 * Its own Postgres schema, like every other context — see `docs/architecture.md`
 * §13. No foreign key to `identity.users`: a module's tables are its own, and a
 * constraint across the boundary is the thing that makes extraction a two-schema
 * migration instead of a `pg_dump`.
 *
 * ── What is not in either table ───────────────────────────────────────────────
 * No private key. No mnemonic. No keystore. No encrypted blob that could be
 * decrypted into any of those. Every column here is either public (an address, a
 * chain id) or ours (an id, a nonce, a timestamp). That is a property of the
 * design and not of the current requirements: a platform holding key material can
 * spend its customers' funds, and encryption at rest does not change that, because
 * the platform must be able to decrypt it to use it at all.
 */
export const walletLinkSchema = pgSchema('wallet_link');

export const linkedWallets = walletLinkSchema.table(
  'linked_wallets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),

    /**
     * Lowercase `0x…`, always.
     *
     * Addresses compare case-insensitively, so the lowercase form is the one the
     * unique index below can be built on. The checksummed form is derived for
     * display and never stored — two representations of one value in one column
     * is how "already linked" starts returning false for a wallet that is.
     */
    address: text('address').notNull(),
    chainId: integer('chain_id').notNull(),

    status: text('status', { enum: ['verified', 'watch-only'] }).notNull(),
    connector: text('connector', { enum: ['injected', 'walletconnect', 'manual'] }).notNull(),

    label: text('label'),
    additionalInfo: text('additional_info'),
    metadata: text('metadata'),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
    /** Null for a watch-only row. Set only by a signature that verified. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    /** Set on disconnect. The row stays — see `LinkedWallet.revoke`. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    /**
     * A screenshot the customer attached to a watch-only row.
     *
     * A pointer, not the bytes: `select * from linked_wallets` is a query an
     * operator will run, and it must not drag a megabyte of image per row across
     * the wire. No foreign key, because the delete order runs the other way —
     * the wallet is saved without the pointer first, then the bytes are removed.
     */
    evidenceId: text('evidence_id'),
    evidenceAt: timestamp('evidence_at', { withTimezone: true }),
  },
  (table) => [
    /* The customer's own page: their wallets, newest activity first. */
    index('linked_wallets_user_idx').on(table.userId, table.lastSeenAt),
    /*
     * One row per (account, address), revoked or not.
     *
     * Covers the revoked rows on purpose. Re-linking a wallet somebody
     * disconnected reuses that row rather than writing a second, so the history of
     * one address on one account stays one row — and the cap counts wallets rather
     * than reconnections.
     */
    uniqueIndex('linked_wallets_unique').on(table.userId, table.address),
  ],
);

/**
 * Challenges awaiting a signature.
 *
 * Short-lived by construction: rows expire in five minutes and are swept from the
 * issue path. The whole message is not stored — it is rebuilt from these columns,
 * which is what makes it impossible for a caller to have the message verified
 * against text the server never issued.
 */
export const linkChallenges = walletLinkSchema.table(
  'link_challenges',
  {
    /** 32 bytes of CSPRNG output, hex. The primary key because it is the identity. */
    nonce: text('nonce').primaryKey(),
    userId: text('user_id').notNull(),
    /** Checksummed here, because this is the exact string inside the signed text. */
    address: text('address').notNull(),
    chainId: integer('chain_id').notNull(),
    domain: text('domain').notNull(),
    uri: text('uri').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /**
     * When the nonce was spent.
     *
     * The single-use guarantee is a conditional `UPDATE … WHERE consumed_at IS
     * NULL` on this column, which is why it is nullable rather than a boolean with
     * a default: the `NULL` is the lock, and the timestamp is the audit.
     */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    /* The sweep. Without it, tidying up scans every challenge ever issued. */
    index('link_challenges_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * The bytes of an attached screenshot.
 *
 * ── Its own table, and in Postgres for now ────────────────────────────────────
 * Same trade the ledger's `deposit_proofs` documents: a `bytea` column inflates
 * every backup and every branch with data written once and read rarely, and this
 * project's tier is 512 MB in total. It sits behind the `EvidenceStorage` port so
 * that swapping to object storage is an adapter and a line in `module.ts`, not a
 * migration of every reader.
 *
 * This table has a tighter budget than the ledger's, because it grows with
 * accounts rather than with claims — hence the 1 MB cap in `evidence.ts`.
 */
export const walletEvidence = walletLinkSchema.table('wallet_evidence', {
  /** A random key. Never derived from an upload's filename. */
  id: text('id').primaryKey(),
  /** Sniffed from the bytes, never taken from the upload's declared type. */
  userId: text('user_id').notNull(),
  contentType: text('content_type', {
    enum: ['image/png', 'image/jpeg', 'image/webp'],
  }).notNull(),
  additionalInfo: text('additional_info'),
  metadata: text('meta_data'),
  bytes: customType<{ data: Uint8Array; driverData: Buffer }>({
    dataType: () => 'bytea',
    toDriver: (value) => Buffer.from(value),
    fromDriver: (value) => new Uint8Array(value),
  })('bytes').notNull(),
  byteLength: integer('byte_length').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which accounts have turned wallet integration on.
 *
 * ── A row's existence is the setting ──────────────────────────────────────────
 * No boolean column, because a boolean has three states in practice — true, false
 * and "no row yet" — and every reader has to decide what the third one means. Here
 * the absence *is* the default, and it is off: an account that has never opened the
 * tab is in exactly the same state as one that turned it off, which is the truth.
 *
 * ── Off is a real state, not a hidden panel ───────────────────────────────────
 * Turning it off is refused while any wallet is still attached, so "no row" always
 * means "this account has no external wallets". A setting that hid the feature
 * while leaving addresses linked would be a switch that does not do what it says.
 */
export const walletLinkSettings = walletLinkSchema.table('settings', {
  userId: text('user_id').primaryKey(),
  enabledAt: timestamp('enabled_at', { withTimezone: true }).notNull(),
});

export type LinkedWalletRow = typeof linkedWallets.$inferSelect;
export type WalletLinkSettingsRow = typeof walletLinkSettings.$inferSelect;
export type WalletEvidenceRow = typeof walletEvidence.$inferSelect;
export type LinkChallengeRow = typeof linkChallenges.$inferSelect;
