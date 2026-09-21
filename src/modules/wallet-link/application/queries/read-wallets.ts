import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import { chainLabel, explorerLink } from '../../domain/chains';
import type { LinkConnector, LinkedWallet, LinkStatus } from '../../domain/linked-wallet';
import type { WalletLinkDependencies } from '../ports';

/**
 * A customer's connected wallets, as the page renders them.
 *
 * ── The checksummed address is computed here, once ────────────────────────────
 * Storage is lowercase so the unique index can do case-insensitive comparison
 * without every query remembering to. Display is EIP-55, because that is the form
 * a person checks against their wallet and the form with the typo-detection in it.
 * The conversion happens at the one point where a stored row becomes something
 * somebody reads.
 */

export interface LinkedWalletDto {
  readonly id: string;
  /** EIP-55 checksummed, for display and for copying. */
  readonly address: string;
  readonly short: string;
  readonly chainId: number;
  readonly chain: string;
  readonly explorer: string | null;
  readonly status: LinkStatus;
  readonly connector: LinkConnector;
  readonly label: string | null;
  readonly linkedAt: string;
  readonly verifiedAt: string | null;
  readonly lastSeenAt: string;
  /**
   * The attachment's key, or null.
   *
   * The key, not the bytes: the image is fetched from its own route so the page
   * payload stays small and the bytes are served with the headers that make their
   * contents irrelevant. See `api/wallet-link/evidence/[evidenceId]`.
   */
  readonly evidenceId: string | null;
  readonly evidenceAt: string | null;
  /** Whether this row is one a file may be attached to at all. */
  readonly acceptsEvidence: boolean;
}

export interface WalletLinkBoardDto {
  readonly wallets: readonly LinkedWalletDto[];
  readonly verified: number;
  readonly watching: number;
  /** True when the read failed. An empty list is not the same as no wallets. */
  readonly degraded: boolean;
}

const EMPTY: WalletLinkBoardDto = { wallets: [], verified: 0, watching: 0, degraded: false };

export async function getWalletLinkBoard(
  deps: WalletLinkDependencies,
  userId: UserId,
): Promise<WalletLinkBoardDto> {
  try {
    const rows = await deps.wallets.listForUser(userId);

    const wallets = rows
      .filter((wallet) => wallet.isActive)
      .map((wallet) => toDto(wallet, deps))
      // Most recently connected first: the one somebody just linked is the one
      // they are looking for, and it is also the one they need to check.
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

    return {
      wallets,
      verified: wallets.filter((wallet) => wallet.status === 'verified').length,
      watching: wallets.filter((wallet) => wallet.status === 'watch-only').length,
      degraded: false,
    };
  } catch (error) {
    // Degrades rather than propagating, like every other customer-facing read
    // here: losing the list should cost the list, not the page that offers to
    // connect a wallet in the first place.
    logger.error({ event: 'wallet_link_board_read_failed', module: 'wallet-link' }, error);
    return { ...EMPTY, degraded: true };
  }
}

function toDto(wallet: LinkedWallet, deps: WalletLinkDependencies): LinkedWalletDto {
  const checksummed = deps.signatures.checksum(wallet.address.value);

  return {
    id: wallet.id,
    address: checksummed,
    short: wallet.address.short(),
    chainId: wallet.chainId,
    chain: chainLabel(wallet.chainId),
    explorer: explorerLink(wallet.chainId, checksummed),
    status: wallet.status,
    connector: wallet.connector,
    label: wallet.label,
    linkedAt: wallet.linkedAt.toISOString(),
    verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
    lastSeenAt: wallet.lastSeenAt.toISOString(),
    evidenceId: wallet.evidenceId,
    evidenceAt: wallet.evidenceAt?.toISOString() ?? null,
    acceptsEvidence: wallet.acceptsEvidence,
  };
}
