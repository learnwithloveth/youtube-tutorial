import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type { WalletLinkDependencies } from './application/ports';
import {
  createIssueChallenge,
  type IssueChallenge,
} from './application/use-cases/issue-challenge';
import {
  createDisableWalletLink,
  createEnableWalletLink,
  type DisableWalletLink,
  type EnableWalletLink,
} from './application/use-cases/manage-settings';
import {
  createAttachEvidence,
  createDetachEvidence,
  type AttachEvidence,
  type DetachEvidence,
} from './application/use-cases/manage-evidence';
import { createLinkWallet, type LinkWallet } from './application/use-cases/link-wallet';
import {
  createRenameWallet,
  createRevokeWallet,
  createWatchAddress,
  type RenameWallet,
  type RevokeWallet,
  type WatchAddress,
} from './application/use-cases/manage-wallets';
import { nobleWalletSignatures } from './infrastructure/crypto/signatures';
import {
  DrizzleLinkChallengeRepository,
  DrizzleLinkedWalletRepository,
  DrizzleWalletLinkSettingsRepository,
  PostgresEvidenceStorage,
  walletIdGenerator,
} from './infrastructure/persistence/repository';

export interface WalletLinkModule {
  readonly issueChallenge: IssueChallenge;
  readonly linkWallet: LinkWallet;
  readonly watchAddress: WatchAddress;
  readonly renameWallet: RenameWallet;
  readonly revokeWallet: RevokeWallet;
  readonly attachEvidence: AttachEvidence;
  readonly detachEvidence: DetachEvidence;
  readonly enable: EnableWalletLink;
  readonly disable: DisableWalletLink;
  readonly dependencies: WalletLinkDependencies;
}

export interface RegisterWalletLinkOptions {
  db: Database;
  /**
   * The origin this deployment issues challenges for.
   *
   * Passed in rather than read from the environment here, so the module has no
   * opinion about configuration and the one place that knows what `APP_URL` means
   * stays `src/server`. It is deliberately not derived from the request: a domain
   * taken from a header is a domain the caller controls, and binding a signature
   * to an attacker-supplied origin binds it to nothing.
   */
  appUrl: string;
  clock?: Clock;
}

export function registerWalletLink(options: RegisterWalletLinkOptions): WalletLinkModule {
  const dependencies: WalletLinkDependencies = {
    wallets: new DrizzleLinkedWalletRepository(options.db),
    challenges: new DrizzleLinkChallengeRepository(options.db),
    evidence: new PostgresEvidenceStorage(options.db),
    settings: new DrizzleWalletLinkSettingsRepository(options.db),
    signatures: nobleWalletSignatures,
    clock: options.clock ?? systemClock,
    ids: walletIdGenerator,
    site: siteFrom(options.appUrl),
  };

  return {
    issueChallenge: createIssueChallenge(dependencies),
    linkWallet: createLinkWallet(dependencies),
    watchAddress: createWatchAddress(dependencies),
    renameWallet: createRenameWallet(dependencies),
    revokeWallet: createRevokeWallet(dependencies),
    attachEvidence: createAttachEvidence(dependencies),
    detachEvidence: createDetachEvidence(dependencies),
    enable: createEnableWalletLink(dependencies),
    disable: createDisableWalletLink(dependencies),
    dependencies,
  };
}

function siteFrom(appUrl: string): { domain: string; uri: string } {
  try {
    const url = new URL(appUrl);
    return { domain: url.host, uri: url.origin };
  } catch {
    return { domain: appUrl, uri: appUrl };
  }
}
