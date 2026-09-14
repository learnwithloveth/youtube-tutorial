/**
 * Failures this context returns as values.
 *
 * Every one of these is a condition a customer or an operator can do something
 * about, and every one has to be sayable out loud — a withdrawal that is refused
 * without a reason generates a support ticket, and "something went wrong" on a
 * money screen is the message that destroys trust fastest.
 *
 * Anything that is merely a bug — an unbalanced transfer, an account that does not
 * exist for an asset we list — throws instead. There is no useful recovery, and
 * returning a value would let the caller carry on.
 */

export type LedgerError =
  | { readonly kind: 'asset-not-supported'; readonly asset: string }
  | { readonly kind: 'network-not-supported'; readonly asset: string; readonly network: string }
  | { readonly kind: 'amount-invalid'; readonly reason: string }
  | { readonly kind: 'amount-below-minimum'; readonly minimum: string; readonly asset: string }
  | { readonly kind: 'destination-invalid'; readonly reason: string }
  | { readonly kind: 'insufficient-funds'; readonly available: string; readonly asset: string }
  | {
      readonly kind: 'daily-limit-exceeded';
      readonly remainingUsd: string;
      readonly capUsd: string;
    }
  /**
   * The withdrawal could not be valued, so the daily limit could not be checked.
   *
   * Separate from a generic failure because the operator response is different:
   * this is the price feed being down, not the customer doing anything wrong, and
   * the page says so rather than implying they are over a limit.
   */
  | { readonly kind: 'valuation-unavailable'; readonly asset: string }
  | { readonly kind: 'withdrawal-not-found'; readonly id: string }
  | { readonly kind: 'withdrawal-already-decided'; readonly status: string }
  | { readonly kind: 'approval-refused'; readonly reason: string };

export const LedgerErrors = {
  assetNotSupported: (asset: string): LedgerError => ({ kind: 'asset-not-supported', asset }),
  networkNotSupported: (asset: string, network: string): LedgerError => ({
    kind: 'network-not-supported',
    asset,
    network,
  }),
  amountInvalid: (reason: string): LedgerError => ({ kind: 'amount-invalid', reason }),
  amountBelowMinimum: (minimum: string, asset: string): LedgerError => ({
    kind: 'amount-below-minimum',
    minimum,
    asset,
  }),
  destinationInvalid: (reason: string): LedgerError => ({
    kind: 'destination-invalid',
    reason,
  }),
  insufficientFunds: (available: string, asset: string): LedgerError => ({
    kind: 'insufficient-funds',
    available,
    asset,
  }),
  dailyLimitExceeded: (remainingUsd: string, capUsd: string): LedgerError => ({
    kind: 'daily-limit-exceeded',
    remainingUsd,
    capUsd,
  }),
  valuationUnavailable: (asset: string): LedgerError => ({
    kind: 'valuation-unavailable',
    asset,
  }),
  withdrawalNotFound: (id: string): LedgerError => ({ kind: 'withdrawal-not-found', id }),
  withdrawalAlreadyDecided: (status: string): LedgerError => ({
    kind: 'withdrawal-already-decided',
    status,
  }),
  approvalRefused: (reason: string): LedgerError => ({ kind: 'approval-refused', reason }),
} as const;

/**
 * Turns an error into something a person reads.
 *
 * In the application layer rather than the UI, because the wording of a refusal on
 * a money screen is part of the rule, not part of the styling — and because two
 * surfaces (the wallet page and any future API) must refuse in the same words.
 */
export function presentLedgerError(error: LedgerError): string {
  switch (error.kind) {
    case 'asset-not-supported':
      return `${error.asset} cannot be withdrawn from this account.`;
    case 'network-not-supported':
      return `${error.network} is not a supported network for ${error.asset}.`;
    case 'amount-invalid':
      return error.reason;
    case 'amount-below-minimum':
      return `The smallest ${error.asset} withdrawal is ${error.minimum}.`;
    case 'destination-invalid':
      return error.reason;
    case 'insufficient-funds':
      return `You have ${error.available} ${error.asset} available.`;
    case 'daily-limit-exceeded':
      return `That is over today's remaining limit of ${error.remainingUsd} of ${error.capUsd}.`;
    case 'valuation-unavailable':
      return `We cannot price ${error.asset} right now, so we cannot check your daily limit. Withdrawals reopen when pricing is restored.`;
    case 'withdrawal-not-found':
      return 'That withdrawal no longer exists.';
    case 'withdrawal-already-decided':
      return `This withdrawal was already ${error.status}.`;
    case 'approval-refused':
      return error.reason;
  }
}
