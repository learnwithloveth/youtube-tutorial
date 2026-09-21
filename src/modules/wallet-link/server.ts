import 'server-only';

/**
 * Server-side entry point for the wallet-link module.
 *
 * A barrel is imported *whole*, so exporting `registerWalletLink` from `index.ts`
 * would drag the database client and the curve library into any Client Component
 * that wanted a `LinkedWalletDto` — and the build would fail, correctly.
 */

export type { RegisterWalletLinkOptions, WalletLinkModule } from './module';
export { registerWalletLink } from './module';

export { getWalletLinkBoard } from './application/queries/read-wallets';
export { isWalletLinkEnabled } from './application/use-cases/manage-settings';
export { getEvidenceFile } from './application/use-cases/manage-evidence';
export type { EvidenceFile } from './application/use-cases/manage-evidence';
export type { AttachEvidenceCommand } from './application/use-cases/manage-evidence';

export type { IssueChallengeCommand } from './application/use-cases/issue-challenge';
export type { LinkWalletCommand } from './application/use-cases/link-wallet';
export type {
  RenameWalletCommand,
  WatchAddressCommand,
} from './application/use-cases/manage-wallets';
