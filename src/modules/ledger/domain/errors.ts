import { shortenDecimalString } from '@/shared/kernel';

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
  /**
   * The asset travels on more than one chain and nobody said which.
   *
   * Separate from `network-not-supported`, because the two need different words:
   * one is "that chain is wrong for this coin", the other is "this coin does not
   * have a single chain to assume". Defaulting to the first network instead would
   * put a stablecoin on Ethereum because it happens to be listed first.
   */
  | { readonly kind: 'network-required'; readonly asset: string; readonly options: string }
  | { readonly kind: 'amount-invalid'; readonly reason: string }
  | { readonly kind: 'amount-below-minimum'; readonly minimum: string; readonly asset: string }
  | { readonly kind: 'destination-invalid'; readonly reason: string }
  | { readonly kind: 'insufficient-funds'; readonly available: string; readonly asset: string }
  /**
   * The balance is there, but nothing to pay the chain's fee with.
   *
   * Carries the coin that is missing and the network that wants it, because
   * "you need gas" is not an instruction anybody can act on — the customer has to
   * know *which* coin to go and get.
   */
  | {
      readonly kind: 'gas-token-required';
      /** The coin the network charges its fee in: ETH, TRX. */
      readonly nativeAsset: string;
      /** The token being withdrawn, which cannot pay for itself. */
      readonly asset: string;
      /** How the network is named on the form — "Tron (TRC-20)". */
      readonly network: string;
    }
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
  | { readonly kind: 'deposit-claim-not-found'; readonly id: string }
  /** The uploaded proof is not an image we will store. Carries the reason shown. */
  | { readonly kind: 'proof-invalid'; readonly reason: string }
  | { readonly kind: 'withdrawal-already-decided'; readonly status: string }
  | { readonly kind: 'approval-refused'; readonly reason: string }
  /* Receipts. Four conditions, because an operator's next move differs for each:
     configure a mail server, wait for a decision, fix the account, or retry. */
  | { readonly kind: 'receipts-unavailable' }
  | { readonly kind: 'receipt-not-yet-available' }
  | { readonly kind: 'receipt-no-address' }
  | { readonly kind: 'receipt-send-failed'; readonly reason: string }
  | { readonly kind: 'risk-unavailable' }
  | { readonly kind: 'risk-signal-not-found' }
  | { readonly kind: 'risk-note-required' };

export const LedgerErrors = {
  assetNotSupported: (asset: string): LedgerError => ({ kind: 'asset-not-supported', asset }),
  networkNotSupported: (asset: string, network: string): LedgerError => ({
    kind: 'network-not-supported',
    asset,
    network,
  }),
  networkRequired: (asset: string, options: string): LedgerError => ({
    kind: 'network-required',
    asset,
    options,
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
  gasTokenRequired: (input: {
    nativeAsset: string;
    asset: string;
    network: string;
  }): LedgerError => ({ kind: 'gas-token-required', ...input }),

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
  depositClaimNotFound: (id: string): LedgerError => ({ kind: 'deposit-claim-not-found', id }),
  proofInvalid: (reason: string): LedgerError => ({ kind: 'proof-invalid', reason }),
  withdrawalAlreadyDecided: (status: string): LedgerError => ({
    kind: 'withdrawal-already-decided',
    status,
  }),
  approvalRefused: (reason: string): LedgerError => ({ kind: 'approval-refused', reason }),
  receiptsUnavailable: (): LedgerError => ({ kind: 'receipts-unavailable' }),
  receiptNotYetAvailable: (): LedgerError => ({ kind: 'receipt-not-yet-available' }),
  receiptNoAddress: (): LedgerError => ({ kind: 'receipt-no-address' }),
  receiptSendFailed: (reason: string): LedgerError => ({ kind: 'receipt-send-failed', reason }),
  riskUnavailable: (): LedgerError => ({ kind: 'risk-unavailable' }),
  riskSignalNotFound: (): LedgerError => ({ kind: 'risk-signal-not-found' }),
  riskNoteRequired: (): LedgerError => ({ kind: 'risk-note-required' }),
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
    case 'network-required':
      return `${error.asset} moves on more than one network. Choose ${error.options}.`;
    case 'amount-invalid':
      return error.reason;
    case 'amount-below-minimum':
      return `The smallest ${error.asset} withdrawal is ${shortenDecimalString(error.minimum)}.`;
    case 'destination-invalid':
      return error.reason;
    case 'insufficient-funds':
      // Shortened: an ether balance is stored at 18 decimals, and "you have
      // 0.000000000000000000 ETH" is a sentence nobody reads to the end.
      return `You have ${shortenDecimalString(error.available)} ${error.asset} available.`;
    case 'gas-token-required':
      // Says the coin, the chain and what to do with it. A customer who has only
      // ever held USDT has no reason to know that sending it costs something else.
      return `Sending ${error.asset} over ${error.network} costs a network fee paid in ${error.nativeAsset}, and you have none. Add some ${error.nativeAsset} to your wallet and try again.`;
    case 'daily-limit-exceeded':
      return `That is over today's remaining limit of ${error.remainingUsd} of ${error.capUsd}.`;
    case 'valuation-unavailable':
      return `We cannot price ${error.asset} right now, so we cannot check your daily limit. Withdrawals reopen when pricing is restored.`;
    case 'withdrawal-not-found':
      return 'That withdrawal no longer exists.';
    case 'deposit-claim-not-found':
      return 'That deposit no longer exists.';
    case 'proof-invalid':
      return error.reason;
    case 'withdrawal-already-decided':
      return `This withdrawal was already ${error.status}.`;
    case 'approval-refused':
      return error.reason;
    case 'receipts-unavailable':
      return 'No mail transport is configured, so receipts cannot be sent.';
    case 'receipt-not-yet-available':
      // The distinction the claim/credit split exists to preserve: a receipt for
      // something nobody has confirmed would tell a customer their money arrived.
      return 'This is still awaiting a decision. A receipt is issued once it has one.';
    case 'receipt-no-address':
      return 'That account has no address on file to send to.';
    case 'receipt-send-failed':
      return `The receipt could not be sent. ${error.reason}`;
    case 'risk-unavailable':
      return 'Risk signals are not available on this deployment.';
    case 'risk-signal-not-found':
      return 'That signal no longer exists. The facts behind it may have changed.';
    case 'risk-note-required':
      return 'Escalating needs a note saying why this one is not ordinary.';
  }
}
