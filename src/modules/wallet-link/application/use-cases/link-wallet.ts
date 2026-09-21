import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { EvmAddress } from '../../domain/address';
import { LinkedWallet, type LinkConnector } from '../../domain/linked-wallet';
import { WalletLinkErrors, type WalletLinkError } from '../errors';
import type { WalletLinkDependencies } from '../ports';

export interface LinkWalletCommand {
  readonly userId: UserId;
  readonly nonce: string;
  /** `0x` + 65 bytes of hex, as `personal_sign` returns it. */
  readonly signature: string;
  readonly connector: LinkConnector;
  readonly label: string | null;
}

/**
 * What the signature did to the account's list.
 *
 * Three cases rather than a boolean, because the customer is told a different
 * thing in each and the action should not have to infer which from two flags.
 */
export type LinkOutcome =
  /** A wallet this account had never attached. */
  | 'linked'
  /** A watch-only or previously disconnected row, now proved. */
  | 'restored'
  /** Already verified. The chain and the last-seen time moved; nothing else did. */
  | 'refreshed';

export interface LinkedWalletResult {
  readonly id: string;
  readonly address: string;
  readonly chainId: number;
  readonly outcome: LinkOutcome;
}

export type LinkWallet = (
  command: LinkWalletCommand,
) => Promise<Result<LinkedWalletResult, WalletLinkError>>;

/**
 * Redeems a signature for a verified link.
 *
 * ── Everything that matters is read from the stored challenge ─────────────────
 * The command carries a nonce and a signature and nothing else of consequence. The
 * address, the chain and the message text all come from the row the server wrote
 * when it issued the challenge. That is the difference between verifying a
 * signature and verifying *our* signature: were the message taken from the
 * request, a caller could submit any (message, signature) pair they had seen
 * anywhere and it would recover correctly.
 *
 * ── The nonce is spent before the signature is checked ────────────────────────
 * `consume` marks it and returns it in one atomic step, and the outcome of the
 * verification does not put it back. A failed attempt therefore burns the
 * challenge, which costs a legitimate customer one extra click and denies an
 * attacker unlimited attempts against a live nonce.
 *
 * ── The account comes from the session, never from the request ────────────────
 * `command.userId` is the caller's own, filled in by the action from
 * `requireUser()`. The challenge additionally records who it was issued to, and
 * the two are compared — so a nonce leaked from one account cannot be redeemed by
 * another, even though both are authenticated.
 */
export function createLinkWallet(deps: WalletLinkDependencies): LinkWallet {
  return async (command) => {
    // The feature is opt-in, and this is the control rather than the hidden
    // panel. A Server Action is a public endpoint, so the check belongs on the
    // path that writes and not on the one that renders.
    if (!(await deps.settings.isEnabled(command.userId))) {
      return err(WalletLinkErrors.notEnabled());
    }

    const now = deps.clock.now();

    const challenge = await deps.challenges.consume(command.nonce, now);
    if (challenge === null) return err(WalletLinkErrors.challengeUnknown());
    if (challenge.userId !== command.userId) return err(WalletLinkErrors.challengeUnknown());

    /*
     * Expiry is checked after consumption, not instead of it.
     *
     * The row is spent either way. Leaving an expired challenge unconsumed would
     * leave a nonce that is refused now and would still be refused later — no
     * harm — but it also leaves the row for the sweep rather than closing it here,
     * and "expired" and "spent" should not be two different lifetimes.
     */
    if (challenge.isExpired(deps.clock)) return err(WalletLinkErrors.challengeExpired());

    const recovered = deps.signatures.recover(challenge.message(), command.signature);
    if (recovered === null) return err(WalletLinkErrors.signatureInvalid());

    const signer = EvmAddress.parse(recovered);
    const claimed = EvmAddress.parse(challenge.address);
    if (signer === null || claimed === null) return err(WalletLinkErrors.signatureInvalid());

    // The comparison the whole flow exists for. A signature that recovers to some
    // other address is a valid signature by somebody else — which is exactly the
    // case a check of "did it recover at all" would wave through.
    if (!signer.equals(claimed)) {
      return err(WalletLinkErrors.signatureMismatch(claimed.short(), signer.short()));
    }

    const existing = await deps.wallets.findByAddress(command.userId, signer.value);

    if (existing !== null) {
      /*
       * Already verified, and verified again.
       *
       * The row is refreshed in place: `linkedAt` and `verifiedAt` keep the
       * instant control was first proved, because that is what they record and a
       * reconnection did not change it. What moves is where the wallet is now and
       * when it was last seen — which is the only new information a repeat
       * signature carries.
       */
      if (existing.proves()) {
        existing.touch(now, challenge.chainId);
        // A label only when one was given. An empty field on the reconnect form
        // must not silently erase a name the customer chose months ago.
        if (command.label !== null) existing.rename(command.label);
        await deps.wallets.save(existing);

        return ok({
          id: existing.id,
          address: signer.value,
          chainId: challenge.chainId,
          outcome: 'refreshed',
        });
      }

      /*
       * A watch-only or previously disconnected row, now proved.
       *
       * Replaced rather than mutated, because `status` and `connector` are
       * readonly on the aggregate — a watch-only row becoming verified is a
       * different fact about the same address, not an edit to the old one. The id
       * is kept so anything referring to it still does, and the original
       * `linkedAt` is deliberately not: the date that matters is when control was
       * proved, and carrying the older one forward would date the proof to before
       * it happened.
       */
      const upgraded = LinkedWallet.verified({
        id: existing.id,
        userId: command.userId,
        address: signer as any,
        chainId: challenge.chainId,
        connector: command.connector,
        label: command.label ?? existing.label,
        now,
      });
      await deps.wallets.save(upgraded);

      /*
       * A signature supersedes a screenshot, so the screenshot goes.
       *
       * `LinkedWallet.verified` carries no attachment, so saving the upgraded row
       * has already cleared the pointer. Deleting the bytes is what makes that a
       * retention rule rather than a display change: the image was held only
       * because there was no proof, and there is proof now. Best-effort — an
       * orphaned file is waste, not a reason to fail a link that succeeded.
       */
      if (existing.evidenceId !== null) {
        await deps.evidence.remove(existing.evidenceId).catch(() => undefined);
      }

      return ok({
        id: upgraded.id,
        address: signer.value,
        chainId: challenge.chainId,
        outcome: 'restored',
      });
    }

    const wallet = LinkedWallet.verified({
      id: deps.ids.next(),
      userId: command.userId,
      address: signer as any,
      chainId: challenge.chainId,
      connector: command.connector,
      label: command.label,
      now,
    });

    await deps.wallets.save(wallet);

    return ok({
      id: wallet.id,
      address: signer.value,
      chainId: challenge.chainId,
      outcome: 'linked',
    });
  };
}
