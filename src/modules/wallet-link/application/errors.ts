import type { EvidenceRejection } from '../domain/evidence';
import { presentEvidenceRejection } from '../domain/evidence';

/**
 * The wallet-link module's error catalogue.
 *
 * No `server-only`: the connect panel is a Client Component and renders these
 * messages, so the presenter has to be reachable from a browser bundle.
 */

export type WalletLinkError =
  | { readonly kind: 'address-invalid' }
  | { readonly kind: 'challenge-unknown' }
  | { readonly kind: 'challenge-expired' }
  | { readonly kind: 'signature-invalid' }
  | { readonly kind: 'signature-mismatch'; readonly expected: string; readonly recovered: string }
  | { readonly kind: 'already-linked' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'chain-invalid' }
  | { readonly kind: 'not-enabled' }
  | { readonly kind: 'wallets-still-connected'; readonly count: number }
  | { readonly kind: 'evidence-not-accepted' }
  | { readonly kind: 'evidence-rejected'; readonly rejection: EvidenceRejection }
  | { readonly kind: 'unavailable' };

export const WalletLinkErrors = {
  addressInvalid: (): WalletLinkError => ({ kind: 'address-invalid' }),
  challengeUnknown: (): WalletLinkError => ({ kind: 'challenge-unknown' }),
  challengeExpired: (): WalletLinkError => ({ kind: 'challenge-expired' }),
  signatureInvalid: (): WalletLinkError => ({ kind: 'signature-invalid' }),
  signatureMismatch: (expected: string, recovered: string): WalletLinkError => ({
    kind: 'signature-mismatch',
    expected,
    recovered,
  }),
  alreadyLinked: (): WalletLinkError => ({ kind: 'already-linked' }),
  notFound: (): WalletLinkError => ({ kind: 'not-found' }),
  chainInvalid: (): WalletLinkError => ({ kind: 'chain-invalid' }),
  notEnabled: (): WalletLinkError => ({ kind: 'not-enabled' }),
  walletsStillConnected: (count: number): WalletLinkError => ({
    kind: 'wallets-still-connected',
    count,
  }),
  evidenceNotAccepted: (): WalletLinkError => ({ kind: 'evidence-not-accepted' }),
  evidenceRejected: (rejection: EvidenceRejection): WalletLinkError => ({
    kind: 'evidence-rejected',
    rejection,
  }),
  unavailable: (): WalletLinkError => ({ kind: 'unavailable' }),
} as const;

/**
 * What the customer is told.
 *
 * Each of these names the next thing to do. "Verification failed" is the message
 * that generates a support ticket; "the wallet that signed was a different one,
 * switch accounts in your wallet and try again" is the message that does not.
 */
export function presentWalletLinkError(error: WalletLinkError): string {
  switch (error.kind) {
    case 'address-invalid':
      return 'That is not a valid wallet address. It should start with 0x and be 42 characters long.';
    case 'challenge-unknown':
      // Covers both "never issued" and "already used", on purpose: distinguishing
      // them tells somebody probing nonces which of their guesses existed.
      return 'That request has already been used or is no longer valid. Start again.';
    case 'challenge-expired':
      return 'The request expired before it was signed. Connect again — it only takes a moment.';
    case 'signature-invalid':
      return 'That signature could not be read. Try connecting again.';
    case 'signature-mismatch':
      // The two addresses, because the cause is almost always a wallet with more
      // than one account selected, and seeing which one signed is the fix.
      return `The wallet that signed was ${error.recovered}, not ${error.expected}. Switch to that account in your wallet and try again.`;
    case 'already-linked':
      return 'That wallet is already connected to your account.';
    case 'not-found':
      return 'That wallet is not connected to your account.';
    case 'chain-invalid':
      return 'Your wallet did not report which network it is on. Try connecting again.';
    case 'not-enabled':
      return 'Turn on wallet integration first.';
    case 'wallets-still-connected':
      // Names the number, because the next action is to go and disconnect them and
      // the customer needs to know how many they are looking for.
      return `Disconnect your ${error.count === 1 ? 'wallet' : `${error.count} wallets`} first. Turning this off is meant to leave nothing attached.`;
    case 'evidence-not-accepted':
      // Says why rather than just refusing. Somebody trying this on a verified
      // wallet has misunderstood what the attachment is for, and the answer is
      // that they already have the stronger thing.
      return 'That wallet is already verified by signature, which is stronger than any screenshot. Nothing more is needed.';
    case 'evidence-rejected':
      return presentEvidenceRejection(error.rejection);
    case 'unavailable':
      return 'Wallet connections are not available on this deployment.';
  }
}
