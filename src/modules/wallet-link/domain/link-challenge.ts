import type { Clock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

/**
 * A one-time message a wallet is asked to sign to prove it is the caller's.
 *
 * ── Why a signature at all ────────────────────────────────────────────────────
 * Anyone can type anyone's address. Without a signature, "linked wallet" means
 * "an address this account typed in", which is a label, not a fact — and a screen
 * that shows it next to a balance is asserting ownership nobody established. The
 * signature is the entire difference between the two states this module models.
 *
 * ── Why the message is EIP-4361 and not a bare nonce ──────────────────────────
 * A wallet shows the signer the exact bytes it is about to sign. A raw nonce is
 * unreadable, so the habit it teaches is "approve whatever the site asked for",
 * which is the habit every signature-based theft depends on. EIP-4361 (Sign-In
 * with Ethereum) is a structured, human-readable statement naming the site, the
 * account, the chain and an expiry — so a person can tell this apart from a
 * transaction, and so can their wallet's own warnings.
 *
 * Three fields in it are load-bearing and each closes a specific replay:
 *  - `domain` and `uri`: a signature harvested by another site does not verify
 *    here, because the text the victim signed names that site instead.
 *  - `nonce`: single use. A signature is a bearer credential forever otherwise —
 *    one captured from a log or a browser extension would relink the wallet at
 *    any time in the future.
 *  - `Expiration Time`: bounds the window in which a captured-but-unredeemed
 *    challenge is worth anything, to minutes rather than indefinitely.
 *
 * ── Nothing here authorises anything ──────────────────────────────────────────
 * Signing this proves control of a key. It is not a sign-in: the caller already
 * has a session, and this challenge is redeemed against that session's account.
 * It is never a way to *get* one, for the reason ADR-0004 gives about verification
 * links — a proof of possession is not an identity.
 */

/**
 * How long a challenge is worth signing.
 *
 * Five minutes: long enough to unlock a hardware wallet and read the message,
 * short enough that a challenge left in a browser tab overnight is dead. The
 * shorter this is, the smaller the window in which an intercepted challenge can be
 * turned into a link — and nothing legitimate takes longer than a few minutes.
 */
export const CHALLENGE_TTL_MS = 5 * 60_000;

export interface LinkChallengeSnapshot {
  readonly nonce: string;
  readonly userId: UserId;
  readonly address: string;
  readonly chainId: number;
  readonly domain: string;
  readonly uri: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export class LinkChallenge {
  private constructor(
    readonly nonce: string,
    readonly userId: UserId,
    /**
     * The checksummed address, as it appears in the signed text.
     *
     * Checksummed rather than lowercase because EIP-4361 says so and because a
     * verifier that reconstructs the message has to reconstruct it byte for byte.
     * The domain does not compute the checksum — it is handed the string the
     * `WalletSignatures` port produced. See `address.ts` for why.
     */
    readonly address: string,
    readonly chainId: number,
    readonly domain: string,
    readonly uri: string,
    readonly issuedAt: Date,
    readonly expiresAt: Date,
    private consumed: Date | null,
  ) {}

  static issue(input: {
    nonce: string;
    userId: UserId;
    checksummedAddress: string;
    chainId: number;
    domain: string;
    uri: string;
    now: Date;
  }): LinkChallenge {
    return new LinkChallenge(
      input.nonce,
      input.userId,
      input.checksummedAddress,
      input.chainId,
      input.domain,
      input.uri,
      input.now,
      new Date(input.now.getTime() + CHALLENGE_TTL_MS),
      null,
    );
  }

  static restore(snapshot: LinkChallengeSnapshot): LinkChallenge {
    return new LinkChallenge(
      snapshot.nonce,
      snapshot.userId,
      snapshot.address,
      snapshot.chainId,
      snapshot.domain,
      snapshot.uri,
      snapshot.issuedAt,
      snapshot.expiresAt,
      snapshot.consumedAt,
    );
  }

  get consumedAt(): Date | null {
    return this.consumed;
  }

  isExpired(clock: Clock): boolean {
    return clock.now().getTime() >= this.expiresAt.getTime();
  }

  /** Spent, whether or not the signature that spent it turned out to be valid. */
  consume(at: Date): void {
    this.consumed = at;
  }

  /**
   * The exact text the wallet signs.
   *
   * Built here, and rebuilt here at verification time from the stored row rather
   * than taken from the request. A verifier that hashes a message the client sent
   * it verifies that the client signed something, which is not the same claim: the
   * client would be free to send a message it had a signature for, and the check
   * would pass against text we never issued.
   *
   * The layout is EIP-4361's, whitespace included. It is a byte-for-byte contract:
   * one changed space produces a different hash and every signature stops
   * verifying, which is why this function has no options and no conditionals.
   */
  message(): string {
    return [
      `${this.domain} wants you to sign in with your Ethereum account:`,
      this.address,
      '',
      STATEMENT,
      '',
      `URI: ${this.uri}`,
      'Version: 1',
      `Chain ID: ${this.chainId}`,
      `Nonce: ${this.nonce}`,
      `Issued At: ${this.issuedAt.toISOString()}`,
      `Expiration Time: ${this.expiresAt.toISOString()}`,
    ].join('\n');
  }

  snapshot(): LinkChallengeSnapshot {
    return {
      nonce: this.nonce,
      userId: this.userId,
      address: this.address,
      chainId: this.chainId,
      domain: this.domain,
      uri: this.uri,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      consumedAt: this.consumed,
    };
  }
}

/**
 * The sentence the signer reads.
 *
 * It says what the signature does and — more importantly — what it does not. The
 * second half is there because the honest answer to "what am I approving" is the
 * one thing a phishing prompt never gives, and somebody who has read it here is
 * better equipped to refuse one elsewhere.
 */
export const STATEMENT =
  'Link this wallet to your account. This signature proves you control the address. ' +
  'It does not move funds, approve any token, or give this site permission to spend.';
