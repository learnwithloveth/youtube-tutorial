import type { Clock, Money } from '@/shared/kernel';
import type { IdGenerator, UserId } from '@/shared/kernel/ids';

import type { LedgerAsset } from '../domain/asset';
import type { AccountId, AccountOwner, LedgerAccount } from '../domain/account';
import type { Transfer } from '../domain/transfer';
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
}

export interface WithdrawalRepository {
  save(withdrawal: Withdrawal): Promise<void>;
  find(id: string): Promise<Withdrawal | null>;
  listForUser(userId: UserId, limit: number): Promise<Withdrawal[]>;
  /** The operator queue: everything awaiting a decision, oldest first. */
  listPending(limit: number): Promise<Withdrawal[]>;
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

export interface LedgerDependencies {
  accounts: LedgerRepository;
  withdrawals: WithdrawalRepository;
  prices: PriceOracle;
  assets: AssetRegistry;
  ids: IdGenerator;
  clock: Clock;
}
