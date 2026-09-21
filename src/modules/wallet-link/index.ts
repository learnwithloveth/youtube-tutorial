/**
 * wallet-link — public API, safe to import anywhere.
 *
 * Types, the chain catalogue and error presentation, which the connect panel needs
 * in the browser. Composition lives in `./server`, which is `server-only`.
 *
 * The *query* is not here: it logs, and the logger is `server-only`. Same trap
 * `alerts`, `ledger`, `identity`, `presence` and `activity` all document — a
 * barrel is imported whole, so one type exported from the wrong one drags the
 * database client into a client bundle and fails the build.
 */

export type { LinkConnector, LinkStatus } from './domain/linked-wallet';
export { MAX_LABEL_LENGTH } from './domain/linked-wallet';

export type { Chain } from './domain/chains';
export { CHAINS, chainLabel, chainOf, explorerLink } from './domain/chains';

export { CHALLENGE_TTL_MS, STATEMENT } from './domain/link-challenge';
export { MAX_EVIDENCE_BYTES } from './domain/evidence';

export type { WalletLinkError } from './application/errors';
export { presentWalletLinkError } from './application/errors';

export type {
  LinkedWalletDto,
  WalletLinkBoardDto,
} from './application/queries/read-wallets';
export type { IssuedChallenge } from './application/use-cases/issue-challenge';
export type { LinkOutcome } from './application/use-cases/link-wallet';
