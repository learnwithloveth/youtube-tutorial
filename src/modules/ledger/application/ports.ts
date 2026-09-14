import type { Clock, Money } from '@/shared/kernel';
import type { IdGenerator, UserId } from '@/shared/kernel/ids';

import type { LedgerAsset } from '../domain/asset';
import type { AccountId, AccountOwner, LedgerAccount } from '../domain/account';
import type { DepositClaim } from '../domain/deposit-claim';
import type { ProofContentType } from '../domain/proof-image';
import type { Transfer, TransferKind } from '../domain/transfer';
import type { Withdrawal, WithdrawalStatus } from '../domain/withdrawal';

/**
 * Ports for the ledger module.
 */

/**
 * Accounts and the transfers that move between them.
 *
 * ── `post` is one method for a reason ──────────────────────────────────────────
 * A transfer and the balance changes it justifies must land together or not at
 * all. Two methods — "write the entries", "update the balances" — is an interface
 * that invites a caller to do one and not the other, and the failure mode is a
 * ledger whose balances no longer equal the sum of its entries. Nobody notices
 * until a reconciliation months later, by which point the missing transfer cannot
 * be identified.
 *
 * So the port takes both at once and the adapter is responsible for atomicity.
 */
export interface LedgerRepository {
  /** Opens the account if it does not exist. Accounts are addressable before use. */
  findOrOpen(owner: AccountOwner, asset: LedgerAsset): Promise<LedgerAccount>;
  find(id: AccountId): Promise<LedgerAccount | null>;
  /** Every account one owner holds, for the wallet page. */
  listForOwner(owner: AccountOwner): Promise<LedgerAccount[]>;

  /**
   * Writes a balanced transfer and the account states it produces, atomically.
   *
   * @throws ConcurrencyError when any account's version has moved on, which is how
   *         two withdrawals racing the same balance are prevented from both
   *         succeeding.
   */
  post(transfer: Transfer, accounts: readonly LedgerAccount[]): Promise<void>;

  /** Persists account state with no transfer — a hold or a release. */
  saveAccounts(accounts: readonly LedgerAccount[]): Promise<void>;

  /**
   * One owner's movements, newest first — the statement.
   *
   * Reads `entries` rather than reconstructing anything from balances, because the
   * entries *are* the record and the balance is the materialised view of them. A
   * statement derived from anything else would be a second opinion about what
   * happened.
   *
   * Returns the transfer's kind and reference alongside each entry: a bare delta
   * says a number changed, and what a customer needs is why.
   */
  listEntries(query: {
    owner: AccountOwner;
    asset?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<StatementEntry[]>;

  countEntries(owner: AccountOwner, asset?: string | undefined): Promise<number>;
}

/** One line of a statement: the movement, and what caused it. */
export interface StatementEntry {
  readonly id: string;
  readonly transferId: string;
  readonly kind: TransferKind;
  readonly reference: string;
  readonly accountId: AccountId;
  /** Signed: positive credited the account, negative debited it. */
  readonly delta: Money;
  readonly occurredAt: Date;
}

/**
 * A point in a time-ordered feed: everything strictly older than this.
 *
 * ── Keyset, not offset ─────────────────────────────────────────────────────────
 * `OFFSET 5000` makes the database count five thousand rows it will then discard,
 * so the last page of a long feed is the slowest one to read. Worse for a console
 * that is scrolled while people are transacting: a row inserted above the window
 * shifts every later offset by one, and the reader silently skips a transaction.
 * A cursor describes a *position in the data* rather than a distance from the
 * start, so neither happens.
 *
 * `id` is the tie-break. Timestamps collide — two deposits in the same
 * millisecond are ordinary — and a cursor on time alone would either repeat the
 * collided rows or drop them, depending on which side of the comparison they fell.
 */
export interface FeedCursor {
  readonly occurredAt: Date;
  /** The record id at that instant. Compared only when the timestamps are equal. */
  readonly id: string;
}

/** One page of a time-ordered feed, newest first. */
export interface FeedPageQuery {
  readonly limit: number;
  /** Omitted for the first page. */
  readonly before?: FeedCursor | undefined;
  /** Restricts the feed to one customer. */
  readonly userId?: UserId | undefined;
  readonly status?: 'pending' | 'approved' | 'rejected' | undefined;
}

export interface WithdrawalRepository {
  save(withdrawal: Withdrawal): Promise<void>;
  find(id: string): Promise<Withdrawal | null>;
  listForUser(userId: UserId, limit: number): Promise<Withdrawal[]>;
  /** The operator queue: everything awaiting a decision, oldest first. */
  listPending(limit: number): Promise<Withdrawal[]>;
  /**
   * The console's feed: every request on the platform, newest first.
   *
   * Separate from `listPending` rather than a flag on it, because the two have
   * opposite orders for opposite reasons — a queue is worked oldest-first so
   * nobody waits forever, and a history is read newest-first because that is where
   * the answer to "what just happened" is.
   */
  listPage(query: FeedPageQuery): Promise<Withdrawal[]>;
  /**
   * Total USD value of a user's withdrawals since an instant.
   *
   * Counts pending and approved, never rejected — see `checkDailyLimit` for why
   * pending has to count. Summed in the database rather than by reading the rows,
   * because the caller only wants the number.
   */
  usedSince(userId: UserId, since: Date): Promise<Money>;
  countByStatus(): Promise<{ status: WithdrawalStatus; total: number }[]>;
}

/**
 * What an amount is worth in USD.
 *
 * A port, because the ledger must not import market-data. The adapter is wired in
 * the composition root above both, which is the only place allowed to know they
 * both exist.
 *
 * Returns null when the asset cannot be priced. Callers must treat that as a
 * refusal rather than a zero — a withdrawal whose value is unknown has not been
 * shown to be within the daily limit, and `Money.zero` would assert that it is.
 */
export interface PriceOracle {
  valueInUsd(amount: Money): Promise<Money | null>;
}

/** The assets this platform will custody. */
export interface AssetRegistry {
  find(code: string): LedgerAsset | null;
  list(): readonly LedgerAsset[];
}

/**
 * Where proof images live.
 *
 * ── A port because the storage will move ───────────────────────────────────────
 * The first adapter keeps bytes in Postgres, which needs no credentials and is
 * transactional with the claim — the proof and the claim cannot diverge. It is
 * also the wrong home at volume: this project's database tier is 512 MB in total,
 * and a few hundred screenshots is a meaningful fraction of it.
 *
 * Object storage with presigned uploads is where this ends up. Keeping it behind a
 * port means that is an adapter and a line in `module.ts`, and the use cases, the
 * schema of the claim, and the console never learn that anything changed.
 */
export interface ProofStorage {
  /**
   * Stores validated bytes and returns their key.
   *
   * Takes a content type the *caller has already sniffed*, not one the client
   * declared. An adapter must not re-derive it from a filename.
   */
  put(bytes: Uint8Array, contentType: ProofContentType): Promise<string>;
  get(proofId: string): Promise<{ bytes: Uint8Array; contentType: ProofContentType } | null>;
  /** Removes a proof. Used when a claim fails to save after its proof was stored. */
  remove(proofId: string): Promise<void>;
}

export interface DepositClaimRepository {
  save(claim: DepositClaim): Promise<void>;
  find(id: string): Promise<DepositClaim | null>;
  listForUser(userId: UserId, limit: number): Promise<DepositClaim[]>;
  /** The operator queue: claims awaiting a decision, oldest first. */
  listPending(limit: number): Promise<DepositClaim[]>;
  /** The console's feed — see `WithdrawalRepository.listPage`. */
  listPage(query: FeedPageQuery): Promise<DepositClaim[]>;
}

export interface LedgerDependencies {
  accounts: LedgerRepository;
  withdrawals: WithdrawalRepository;
  claims: DepositClaimRepository;
  proofs: ProofStorage;
  prices: PriceOracle;
  assets: AssetRegistry;
  ids: IdGenerator;
  clock: Clock;
}
