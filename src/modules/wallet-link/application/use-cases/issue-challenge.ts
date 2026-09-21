import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { EvmAddress } from '../../domain/address';
import { LinkChallenge } from '../../domain/link-challenge';
import { WalletLinkErrors, type WalletLinkError } from '../errors';
import type { WalletLinkDependencies } from '../ports';

export interface IssueChallengeCommand {
  readonly userId: UserId;
  /** The address the browser's wallet reported. Unproven at this point. */
  readonly address: string;
  readonly chainId: number;
}

export interface IssuedChallenge {
  readonly nonce: string;
  /** The exact text to pass to `personal_sign`. Built on the server, always. */
  readonly message: string;
  readonly expiresAt: string;
}

export type IssueChallenge = (
  command: IssueChallengeCommand,
) => Promise<Result<IssuedChallenge, WalletLinkError>>;

/**
 * Issues a challenge for an address the caller claims.
 *
 * ── The claim is unverified and that is fine ──────────────────────────────────
 * Anyone may ask for a challenge naming any address. Nothing is granted by the
 * asking: the challenge is worthless without a signature from that address's key,
 * and it is bound to the requesting session, so a challenge obtained for somebody
 * else's address links a wallet to *this* account or to nothing.
 *
 * ── The cap is checked here as well as at redemption ──────────────────────────
 * Not because this check is the control — the one in `linkWallet` is — but because
 * asking somebody to unlock a hardware wallet and sign, then telling them they are
 * at their limit, is a bad way to deliver that news.
 *
 * ── An already-connected wallet is not refused ────────────────────────────────
 * Signing again refreshes the row rather than erroring. Somebody who has switched
 * their wallet from Ethereum to Base and reconnects is telling us where they are
 * now, and that is worth recording; refusing would leave the list asserting a
 * network they left. It costs nothing to allow — the signature is checked exactly
 * as it is the first time, and the row it lands on is the same one.
 */
export function createIssueChallenge(deps: WalletLinkDependencies): IssueChallenge {
  return async (command) => {
    // The feature is opt-in, and this is the control rather than the hidden
    // panel. A Server Action is a public endpoint, so the check belongs on the
    // path that writes and not on the one that renders.
    if (!(await deps.settings.isEnabled(command.userId))) {
      return err(WalletLinkErrors.notEnabled());
    }

    const address = EvmAddress.parse(command.address);
    if (address === null) return err(WalletLinkErrors.addressInvalid());

    // A chain id is a positive integer. `eth_chainId` returning something else
    // means the provider is broken or the value was fabricated, and signing a
    // message that names `Chain ID: NaN` would be signing nonsense.
    if (!Number.isSafeInteger(command.chainId) || command.chainId <= 0) {
      return err(WalletLinkErrors.chainInvalid());
    }

    /* The row for this address used to be looked up here, only to decide whether
       the account had room for one more wallet. There is no cap, so nothing is
       counted and nothing needs to be read before issuing the challenge. */

    const now = deps.clock.now();

    /*
     * The sweep rides this path rather than a cron entry.
     *
     * Same reasoning as the presence sweep: a challenge row carries an address and
     * an account id, and holding those past the five minutes they were useful for
     * is data kept without a justification. Issuing a challenge is the moment this
     * table grows, so it is the moment to drop what expired — and a sweep attached
     * to the write is one nobody has to remember to configure.
     *
     * Best-effort: failing to tidy up must not stop somebody connecting a wallet.
     */
    void deps.challenges.sweep(now).catch(() => undefined);

    const challenge = LinkChallenge.issue({
      nonce: deps.challenges.nextNonce(),
      userId: command.userId,
      checksummedAddress: deps.signatures.checksum(address.value),
      chainId: command.chainId,
      domain: deps.site.domain,
      uri: deps.site.uri,
      now,
    });

    await deps.challenges.issue(challenge);

    return ok({
      nonce: challenge.nonce,
      message: challenge.message(),
      expiresAt: challenge.expiresAt.toISOString(),
    });
  };
}
