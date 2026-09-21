import 'server-only';

import { cache } from 'react';

import type { WalletLinkBoardDto } from '@/modules/wallet-link';
import {
  getEvidenceFile,
  getWalletLinkBoard,
  isWalletLinkEnabled,
  registerWalletLink,
  type WalletLinkModule,
} from '@/modules/wallet-link/server';
import { db } from '@/platform/db/client';
import { env } from '@/platform/env';
import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

/**
 * The application's wallet-link facade.
 *
 * ── Null means "not on this deployment", and the page says so ─────────────────
 * Like `alerts`, this returns null without a database rather than throwing. A
 * fresh clone with no `DATABASE_URL` still renders the wallet page, with the
 * connect panel disabled and an explanation — the same rule the deposit panel
 * follows when no address is configured.
 *
 * ── Why the origin comes from `APP_URL` ───────────────────────────────────────
 * It is the same value the identity module builds mail links from, and for the
 * same reason: one place states what this deployment's origin is. A challenge
 * signed for a domain taken from the incoming request would be signed for whatever
 * a caller put in a header, which is the one thing an EIP-4361 `domain` field
 * exists to prevent.
 */
export const walletLink = cache((): WalletLinkModule | null => {
  const database = db();
  if (database === null) return null;

  return registerWalletLink({ db: database, appUrl: env().APP_URL });
});

export interface WalletLinkView extends WalletLinkBoardDto {
  /** True when no database is configured — not the same as having no wallets. */
  readonly unavailable: boolean;
}

const UNAVAILABLE: WalletLinkView = {
  wallets: [],
  verified: 0,
  watching: 0,
  degraded: false,
  unavailable: true,
};

/**
 * Whether this account has turned wallet integration on.
 *
 * Degrades to `false` rather than throwing. The settings tab renders either an
 * "enable" panel or the feature, and a database hiccup should show the former —
 * which is inert — rather than take out the whole settings page. Every write path
 * re-checks this against the database anyway, so a false negative here costs a
 * click and grants nothing.
 */
export const isWalletLinkEnabledFor = cache(async (userId: UserId): Promise<boolean> => {
  const context = walletLink();
  if (context === null) return false;

  try {
    return await isWalletLinkEnabled(context.dependencies, userId);
  } catch (error) {
    logger.warn({ event: 'wallet_link_setting_read_failed', module: 'wallet-link' }, error);
    return false;
  }
});

export const getLinkedWalletsFor = cache(async (userId: UserId): Promise<WalletLinkView> => {
  const context = walletLink();
  if (context === null) return UNAVAILABLE;

  const board = await getWalletLinkBoard(context.dependencies, userId);
  return { ...board, unavailable: false };
});

/**
 * One attached screenshot, with the account it belongs to.
 *
 * Not memoised: it is read once per request by a route handler that serves the
 * bytes and by nothing else, so `React.cache` would hold a megabyte for the
 * lifetime of a request in order to save a lookup nobody makes twice.
 */
export async function getWalletEvidence(
  evidenceId: string,
): Promise<{ bytes: Uint8Array; contentType: string; ownerId: string } | null> {
  const context = walletLink();
  if (context === null) return null;

  return getEvidenceFile(context.dependencies, evidenceId);
}
