import type { WithdrawalStatus } from '../domain/withdrawal';

/**
 * Ledger DTOs.
 *
 * Every amount crosses as an **exact decimal string**, never a number. That is the
 * money rule applied at the boundary: a DTO with `balance: number` would discard
 * the precision `Money` exists to preserve, and it would do it silently, at the
 * one layer where the mistake is invisible in review.
 */

export interface BalanceDto {
  readonly asset: string;
  readonly name: string;
  readonly scale: number;
  /** Everything held, including anything reserved. */
  readonly total: string;
  /** What may actually be spent right now. */
  readonly available: string;
  /** Reserved against pending withdrawals. */
  readonly held: string;
  /**
   * Worth in USD, or null when the asset could not be priced.
   *
   * Null is a state to render, not a gap to fill. A zero here would say the holding
   * is worthless, which is a very different claim from "we do not currently know
   * what it is worth" — and on a page showing someone their own money, the
   * difference is the whole point.
   */
  readonly valueUsd: string | null;
}

export interface WalletDto {
  readonly balances: readonly BalanceDto[];
  /**
   * Total portfolio value, or null when *any* held asset could not be priced.
   *
   * All-or-nothing rather than summing what we can. A total that quietly omits an
   * unpriceable holding is wrong by exactly that holding's value, and it is wrong
   * without saying so — the customer sees a smaller number and no reason for it.
   */
  readonly totalValueUsd: string | null;
  /** True when at least one holding had no price. Drives the caveat on the page. */
  readonly valuationIncomplete: boolean;
  /*
   * There was a `limits: DailyLimitDto` here — the tier, the daily cap, what had
   * been used against it and when it reset. It is gone with the cap itself: this
   * deployment does not bound what an account may withdraw, so there is no number
   * to report and the wallet page's "left today" readout would have been stating
   * a rule that no longer exists.
   */
  readonly pendingWithdrawals: readonly WithdrawalDto[];
  /** True when the read degraded — an empty wallet and a failed query differ. */
  readonly degraded: boolean;
}

export interface WithdrawalDto {
  readonly id: string;
  readonly userId: string;
  readonly asset: string;
  readonly amount: string;
  readonly fee: string;
  readonly network: string;
  /** Masked for display — see `maskDestination`. */
  readonly destination: string;
  readonly valueUsd: string | null;
  readonly status: WithdrawalStatus;
  readonly requestedAt: string;
  readonly decidedAt: string | null;
  readonly reason: string | null;
  readonly approvalsHeld: number;
  readonly approvalsRequired: number;
}

export interface AssetOptionDto {
  readonly code: string;
  readonly name: string;
  readonly scale: number;
  readonly minimumWithdrawal: string;
  readonly networks: readonly {
    readonly id: string;
    readonly label: string;
    readonly fee: string;
    readonly eta: string;
  }[];
}

/**
 * Shortens an address for display.
 *
 * Not a security control — the full value is in the database and the operator can
 * read it there. It is a legibility one: a 42-character address in a table column
 * wraps to three lines and pushes everything else off screen, and the first and
 * last characters are what a person actually compares when checking one.
 */
export function maskDestination(destination: string): string {
  if (destination.length <= 16) return destination;
  return `${destination.slice(0, 8)}…${destination.slice(-6)}`;
}
