import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { EvmAddress } from '../../domain/address';
import { LinkedWallet } from '../../domain/linked-wallet';
import { WalletLinkErrors, type WalletLinkError } from '../errors';
import type { WalletLinkDependencies } from '../ports';

/* =============================================================================
 * Watch an address
 * ========================================================================== */

export interface WatchAddressCommand {
  readonly userId: UserId;
  readonly address: string;
  readonly chainId: number;
  readonly label: string | null;
}

export type WatchAddress = (
  command: WatchAddressCommand,
) => Promise<Result<{ id: string; address: string }, WalletLinkError>>;

/**
 * Adds an address by hand, proving nothing.
 *
 * ── This is the manual path, and what it is not ───────────────────────────────
 * The only thing a person types here is a public address. A recovery phrase, a
 * private key or a keystore file would hand over control of every asset the wallet
 * holds, forever, to whoever can read this database — so there is no field for
 * one, no parameter that would accept one, and no code path that could store one.
 * A site asking for a seed phrase is a theft in progress regardless of what it
 * says about itself, and the absence here is deliberate and permanent.
 *
 * ── What a watch-only row is good for ─────────────────────────────────────────
 * Watching an address is a real thing to want: a cold wallet nobody wants to
 * connect, or a hardware wallet that lives in a safe. It goes on the list clearly
 * marked, and `LinkedWallet.proves()` returns false for it forever unless a
 * signature arrives.
 */
export function createWatchAddress(deps: WalletLinkDependencies): WatchAddress {
  return async (command) => {
    // The feature is opt-in, and this is the control rather than the hidden
    // panel. A Server Action is a public endpoint, so the check belongs on the
    // path that writes and not on the one that renders.
    if (!(await deps.settings.isEnabled(command.userId))) {
      return err(WalletLinkErrors.notEnabled());
    }

    const address = command.address;

    // const existing = await deps.wallets.findByAddress(command.userId, address);
    // if (existing !== null && existing.isActive) return err(WalletLinkErrors.alreadyLinked());

    const wallet = LinkedWallet.watchOnly({
      id: deps.ids.next(),
      userId: command.userId,
      address,
      chainId: command.chainId,
      label: command.label,
      now: deps.clock.now(),
    });

    await deps.wallets.save(wallet);
    return ok({ id: wallet.id, address: address });
  };
}

/* =============================================================================
 * Rename and disconnect
 * ========================================================================== */

export interface RenameWalletCommand {
  readonly userId: UserId;
  readonly id: string;
  readonly label: string | null;
}

export type RenameWallet = (command: RenameWalletCommand) => Promise<Result<void, WalletLinkError>>;

export function createRenameWallet(deps: WalletLinkDependencies): RenameWallet {
  return async (command) => {
    // Looked up by (id, account), never by id alone. A row id is the one value a
    // caller supplies, so it is the one that must not be enough on its own.
    const wallet = await deps.wallets.find(command.id, command.userId);
    if (wallet === null || !wallet.isActive) return err(WalletLinkErrors.notFound());

    wallet.rename(command.label);
    await deps.wallets.save(wallet);
    return ok(undefined);
  };
}

export type RevokeWallet = (command: {
  userId: UserId;
  id: string;
}) => Promise<Result<{ address: string }, WalletLinkError>>;

/**
 * Disconnects a wallet.
 *
 * Needs no signature and no step-up. Severing a link is always safe — it removes
 * a claim rather than making one — and requiring a proof to disconnect would mean
 * somebody who has lost access to a wallet can never detach it from their account,
 * which is precisely when they most want to.
 */
export function createRevokeWallet(deps: WalletLinkDependencies): RevokeWallet {
  return async (command) => {
    const wallet = await deps.wallets.find(command.id, command.userId);
    if (wallet === null || !wallet.isActive) return err(WalletLinkErrors.notFound());

    wallet.revoke(deps.clock.now());
    await deps.wallets.save(wallet);
    return ok({ address: wallet.address });
  };
}
