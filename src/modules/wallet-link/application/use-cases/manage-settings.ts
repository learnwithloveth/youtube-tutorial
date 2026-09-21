import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { WalletLinkErrors, type WalletLinkError } from '../errors';
import type { WalletLinkDependencies } from '../ports';

/**
 * Turning wallet integration on and off for one account.
 *
 * ── Why it is opt-in at all ───────────────────────────────────────────────────
 * Most people with an account here will never connect an external wallet, and a
 * settings tab that opens onto a connect button, an address form and a file
 * upload is a lot of surface offered to somebody who did not ask for it. Behind a
 * switch, the default state of the account is the simple one, and every write path
 * in the module refuses until the account holder has said yes.
 *
 * That last part is what makes it a control rather than a curtain: `issueChallenge`,
 * `linkWallet`, `watchAddress` and `attachEvidence` each check this, so an account
 * with the feature off cannot have a wallet attached by a POST that skipped the UI.
 * A Server Action is a public endpoint, and hiding a panel protects nothing.
 */

export type EnableWalletLink = (
  command: { userId: UserId },
) => Promise<Result<void, WalletLinkError>>;

export function createEnableWalletLink(deps: WalletLinkDependencies): EnableWalletLink {
  return async (command) => {
    // Idempotent. Two clicks, or a click and a stale tab replaying one, both leave
    // the account enabled rather than the second erroring at somebody who is
    // already where they wanted to be.
    await deps.settings.enable(command.userId, deps.clock.now());
    return ok(undefined);
  };
}

export type DisableWalletLink = (
  command: { userId: UserId },
) => Promise<Result<void, WalletLinkError>>;

/**
 * Turns it off — but only when nothing is attached.
 *
 * ── The refusal is the honest part ────────────────────────────────────────────
 * The tempting implementation hides the panel and leaves the rows. Then "off"
 * means "you still have three wallets linked to this account and cannot see them",
 * which is the opposite of what somebody switching it off believes they have done,
 * and the addresses are still on an operator's screen.
 *
 * So off means off: while any wallet is active, this refuses and names how many
 * there are. Disconnecting is one click per wallet and always available, so the
 * path out is never blocked — only the misleading shortcut is.
 */
export function createDisableWalletLink(deps: WalletLinkDependencies): DisableWalletLink {
  return async (command) => {
    const active = await deps.wallets.countActiveForUser(command.userId);
    if (active > 0) return err(WalletLinkErrors.walletsStillConnected(active));

    await deps.settings.disable(command.userId);
    return ok(undefined);
  };
}

/**
 * Whether this account has it on.
 *
 * A plain read rather than a `Result`: "no" is an ordinary answer, and a database
 * that cannot be reached throws, which is the caller's problem and not a state
 * this function should invent a value for.
 */
export async function isWalletLinkEnabled(
  deps: WalletLinkDependencies,
  userId: UserId,
): Promise<boolean> {
  return deps.settings.isEnabled(userId);
}
