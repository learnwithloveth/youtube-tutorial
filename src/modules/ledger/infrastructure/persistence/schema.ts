import {
  customType,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Tables owned by the ledger module.
 *
 * Its own Postgres schema — see `identity/…/schema.ts` for why a real namespace
 * beats a name prefix. This one earns it more than the others: `REVOKE ALL ON
 * SCHEMA ledger` is the grant that stops a reporting connection reading customer
 * balances, and it is enforced by the database rather than by review.
 *
 * ── Amounts are `numeric`, and that is not negotiable ──────────────────────────
 * `double precision` cannot represent most decimal fractions, which in a ledger
 * means money that does not exist. Drizzle returns `numeric` as a *string*, so a
 * balance reaches `Money.fromDecimalString` without ever passing through a
 * JavaScript number in either direction.
 *
 * The scale is 36 because the assets differ: bitcoin needs 8 places, ether needs
 * 18, and a column sized for one truncates the other. One wide column is simpler
 * than a column per asset and costs nothing — `numeric` stores only the digits
 * present.
 */

export const ledgerSchema = pgSchema('ledger');

/**
 * One account per owner per asset.
 *
 * The balance is stored rather than derived from `entries`. Deriving is purer and
 * unusable: it turns every balance read into a scan of the account's whole history,
 * and this is the most-read table on the platform. The entries remain the record of
 * truth and the balance is a materialised view of them — reconcilable at any time
 * by summing, which is exactly what a reconciliation job should do.
 */
export const accounts = ledgerSchema.table(
  'accounts',
  {
    /**
     * Derived from owner and asset (`user:<uuid>:BTC`, `platform:custody:BTC`)
     * rather than random, so an account is addressable before it exists and a row
     * is self-describing in a database console — which matters on the one table an
     * operator reads when the numbers are disputed.
     */
    id: text('id').primaryKey(),

    ownerKind: text('owner_kind', { enum: ['user', 'platform'] }).notNull(),
    /** An opaque `UserId`, or the platform purpose. No foreign key — see below. */
    ownerId: text('owner_id').notNull(),

    asset: text('asset').notNull(),
    /** Decimal places the amounts are stored at. Denormalised so a row is readable. */
    scale: integer('scale').notNull(),

    balance: numeric('balance', { precision: 48, scale: 36 }).notNull().default('0'),
    /** Reserved against pending withdrawals. Never exceeds `balance` for a user. */
    held: numeric('held', { precision: 48, scale: 36 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Optimistic-concurrency token.
     *
     * The control that stops two withdrawals racing one balance: both read version
     * 7, both find the funds sufficient, and only one write at version 7 succeeds.
     * Without it the second overwrites the first and the account has paid out twice.
     */
    version: integer('version').notNull().default(0),
  },
  (table) => [
    index('accounts_owner_idx').on(table.ownerKind, table.ownerId),
    uniqueIndex('accounts_owner_asset_uq').on(table.ownerKind, table.ownerId, table.asset),
  ],
);

/**
 * A balanced set of entries.
 *
 * The row exists so entries have something to group by and a reference to explain
 * them. The balance invariant is enforced in the domain, not here — Postgres cannot
 * express "these rows sum to zero" as a constraint without a trigger, and a trigger
 * would put a business rule somewhere no test in this repository can reach.
 */
export const transfers = ledgerSchema.table(
  'transfers',
  {
    id: text('id').primaryKey(),
    kind: text('kind', {
      enum: ['deposit', 'withdrawal', 'withdrawal-fee', 'adjustment'],
    }).notNull(),
    /** What this was for: a transaction hash, a withdrawal id, a ticket number. */
    reference: text('reference').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('transfers_occurred_idx').on(table.occurredAt)],
);

/**
 * The record of truth: one row per account movement.
 *
 * Append-only. There is no update path in the repository and no reason for one — a
 * correction to a ledger is a new balancing transfer, never an edit, because an
 * edited entry is one whose history cannot be reconstructed.
 */
export const entries = ledgerSchema.table(
  'entries',
  {
    id: text('id').primaryKey(),
    transferId: text('transfer_id')
      .notNull()
      // The one foreign key in this module, and it stays inside the module's own
      // schema. Entries without their transfer are unexplainable, so the database
      // should refuse to create them.
      .references(() => transfers.id, { onDelete: 'restrict' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    asset: text('asset').notNull(),
    /** Positive credits the account, negative debits it. */
    delta: numeric('delta', { precision: 48, scale: 36 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // The statement: one account's movements, newest first.
    index('entries_account_idx').on(table.accountId, table.occurredAt),
    // Reconciliation: sum the legs of one transfer and check they are zero.
    index('entries_transfer_idx').on(table.transferId),
  ],
);

/**
 * Withdrawal requests and their decisions.
 *
 * Separate from `transfers` because a withdrawal is mostly *not* a movement: it is
 * a request that may be refused, and only the approved ones ever produce entries.
 * Modelling it as a transfer would mean every rejection needed a reversing transfer
 * and the customer's statement would show two movements for something that never
 * happened.
 */
export const withdrawals = ledgerSchema.table(
  'withdrawals',
  {
    id: text('id').primaryKey(),
    /** Opaque `UserId`. No foreign key to `identity.users` — see any module schema. */
    userId: text('user_id').notNull(),

    asset: text('asset').notNull(),
    scale: integer('scale').notNull(),
    amount: numeric('amount', { precision: 48, scale: 36 }).notNull(),
    fee: numeric('fee', { precision: 48, scale: 36 }).notNull(),

    network: text('network').notNull(),
    /** Stored in full. The console masks it for display; the operator can read it. */
    destination: text('destination').notNull(),

    /**
     * USD value at the moment of the request.
     *
     * Frozen deliberately: the daily limit was checked against this number, so the
     * record of the decision must carry the number the decision was made on.
     * Re-valuing later at a different price would make the audit trail disagree
     * with the rule that was actually applied.
     */
    valuedAtUsd: numeric('valued_at_usd', { precision: 38, scale: 2 }),

    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: text('decided_by'),
    /** Required on a rejection: the customer is shown it. */
    reason: text('reason'),

    version: integer('version').notNull().default(0),
  },
  (table) => [
    // The operator queue: pending, oldest first.
    index('withdrawals_status_idx').on(table.status, table.requestedAt),
    // The customer's own list, and the daily-limit sum.
    index('withdrawals_user_idx').on(table.userId, table.requestedAt),
    // The console's platform-wide feed: every request in time order, regardless of
    // status. The two indexes above both lead with a discriminator, so neither can
    // serve an unfiltered scan — Postgres would sort the whole table instead. `id`
    // is the tie-break the keyset cursor pages on.
    index('withdrawals_requested_idx').on(table.requestedAt, table.id),
  ],
);

/**
 * One row per operator signature.
 *
 * A child table rather than two columns on `withdrawals`, because the rule is "how
 * many signatures" and the policy decides the number — today one or two, tomorrow
 * three for an institutional payout. Two columns would have to become three, and
 * the queries that count them would all have to change.
 *
 * The unique index is the control, not a convention: it makes "the same operator
 * approving twice" impossible at the database level, which is what dual control
 * actually depends on. The domain checks it too; this is the one that holds when
 * two requests race.
 */
export const withdrawalApprovals = ledgerSchema.table(
  'withdrawal_approvals',
  {
    id: text('id').primaryKey(),
    withdrawalId: text('withdrawal_id')
      .notNull()
      .references(() => withdrawals.id, { onDelete: 'cascade' }),
    /** Opaque `UserId` of the operator. */
    operatorId: text('operator_id').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('withdrawal_approvals_once_uq').on(table.withdrawalId, table.operatorId),
  ],
);

/**
 * Customer claims that funds arrived, awaiting an operator's confirmation.
 *
 * Separate from `transfers` because a claim is mostly *not* a movement: it is an
 * assertion with evidence that may be refused, and only the approved ones ever
 * produce entries. `transfer_id` points at the movement once there is one.
 */
export const depositClaims = ledgerSchema.table(
  'deposit_claims',
  {
    id: text('id').primaryKey(),
    /** Opaque `UserId`. No foreign key to identity — see any module schema. */
    userId: text('user_id').notNull(),

    asset: text('asset').notNull(),
    network: text('network').notNull(),
    scale: integer('scale').notNull(),

    /** What the customer says they sent. */
    claimedAmount: numeric('claimed_amount', { precision: 48, scale: 36 }).notNull(),
    /**
     * What an operator verified arrived. Null until approved.
     *
     * Kept beside the claim rather than overwriting it: the gap between the two is
     * exactly what a dispute is about, and one column would record the answer over
     * the question.
     */
    creditedAmount: numeric('credited_amount', { precision: 48, scale: 36 }),

    /** The customer's transaction hash or bank reference. Checked against the proof. */
    reference: text('reference').notNull(),
    /** Key of the stored proof image. Never a filename the customer chose. */
    proofId: text('proof_id').notNull(),

    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: text('decided_by'),
    /** Required on a rejection: the customer is shown it. */
    reason: text('reason'),
    /** The transfer that credited the funds, once approved. */
    transferId: text('transfer_id'),

    version: integer('version').notNull().default(0),
  },
  (table) => [
    index('deposit_claims_status_idx').on(table.status, table.submittedAt),
    index('deposit_claims_user_idx').on(table.userId, table.submittedAt),
    // The console's platform-wide feed — see `withdrawals_requested_idx`.
    index('deposit_claims_submitted_idx').on(table.submittedAt, table.id),
  ],
);

/**
 * Proof images, as bytes.
 *
 * ── This table is the one to move first ────────────────────────────────────────
 * Postgres is a deliberate starting point, not the destination. It needs no
 * credentials and lands in the same database as the claim, so the two cannot
 * diverge. It is also the wrong home at volume: this project's tier is 512 MB in
 * total, and a `bytea` column inflates every backup and every branch with data
 * that is written once and read a handful of times.
 *
 * The rule of thumb is a few hundred proofs. Past that, `ProofStorage` gets an
 * object-storage adapter and this table is dropped — which is the whole reason it
 * sits behind a port rather than being read directly by the console.
 *
 * Its own table rather than a column on the claim, so that `select * from
 * deposit_claims` — which an operator will run — does not drag megabytes of image
 * across the wire.
 */
export const depositProofs = ledgerSchema.table('deposit_proofs', {
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

export type AccountRow = typeof accounts.$inferSelect;
export type DepositClaimRow = typeof depositClaims.$inferSelect;
export type DepositProofRow = typeof depositProofs.$inferSelect;
export type TransferRow = typeof transfers.$inferSelect;
export type EntryRow = typeof entries.$inferSelect;
export type WithdrawalRow = typeof withdrawals.$inferSelect;
export type WithdrawalApprovalRow = typeof withdrawalApprovals.$inferSelect;
