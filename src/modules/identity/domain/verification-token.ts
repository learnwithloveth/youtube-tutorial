/**
 * VerificationToken — a single-use, time-limited proof sent to an email address.
 *
 * Pure domain. No framework, no I/O.
 *
 * ── What the token proves ───────────────────────────────────────────────────────
 * Only one thing: that whoever presents it received mail at that address. That is
 * enough to confirm an address, and enough to authorise a password reset — but it
 * is *not* a session, and confirming an address must never sign anyone in. A
 * verification link travels through mail servers, sits in inboxes, and gets
 * prefetched by scanners; treating it as an authentication credential would make
 * every one of those a login.
 *
 * ── Why the stored form is a hash ───────────────────────────────────────────────
 * The row holds `tokenHash`, never the token. A database leak then yields nothing
 * usable: an attacker with the hash cannot construct the link. This is the same
 * reasoning as password storage, with one deliberate difference — see below.
 */

import { err, ok, type Result } from '@/shared/kernel/result';
import type { UserId } from '@/shared/kernel/ids';

export type VerificationPurpose = 'email-verification' | 'password-reset';

export type VerificationFailure =
  | { _tag: 'TokenExpired' }
  | { _tag: 'TokenAlreadyUsed' }
  | { _tag: 'TokenPurposeMismatch' };

/**
 * Lifetimes, chosen per purpose rather than shared.
 *
 * A password reset hands over control of the account, so its window is short: the
 * link is live in an inbox, and an inbox is not a vault. Confirming an address is
 * far less powerful, and a 24-hour window avoids the support cost of people who
 * open their mail the next morning.
 */
export const TOKEN_LIFETIME_MS: Record<VerificationPurpose, number> = {
  'email-verification': 24 * 60 * 60 * 1000,
  // Fifteen minutes, which is what the reset screen tells the user. The number
  // lives here and the copy is derived from it, so the two cannot drift.
  'password-reset': 15 * 60 * 1000,
};

/**
 * Entropy of the token itself, in bytes.
 *
 * 32 bytes is 256 bits. At that size guessing is not a threat model, which is what
 * lets the stored digest be a *fast* hash — see `VerificationTokenHasher` in the
 * ports. Passwords need a slow KDF because they are low-entropy and human-chosen;
 * a 256-bit random value is not, and running scrypt on it would add 100ms to every
 * link click while buying nothing.
 */
export const TOKEN_ENTROPY_BYTES = 32;

export interface VerificationTokenProps {
  id: string;
  userId: UserId;
  purpose: VerificationPurpose;
  /** Digest of the token. The token itself is never stored. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export class VerificationToken {
  private constructor(private props: VerificationTokenProps) {}

  static issue(input: {
    id: string;
    userId: UserId;
    purpose: VerificationPurpose;
    tokenHash: string;
    now: Date;
  }): VerificationToken {
    return new VerificationToken({
      id: input.id,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + TOKEN_LIFETIME_MS[input.purpose]),
      consumedAt: null,
    });
  }

  static rehydrate(props: VerificationTokenProps): VerificationToken {
    return new VerificationToken(props);
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): UserId {
    return this.props.userId;
  }
  get purpose(): VerificationPurpose {
    return this.props.purpose;
  }
  get tokenHash(): string {
    return this.props.tokenHash;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get consumedAt(): Date | null {
    return this.props.consumedAt;
  }

  /**
   * Whether this token may be redeemed right now, for this purpose.
   *
   * The purpose check is not defensive padding. Without it, a token issued to
   * confirm an address — the low-value, long-lived, widely-scanned one — could be
   * replayed against the password reset endpoint, which hands over the account.
   * Tokens are scoped to exactly what they were issued for.
   */
  canBeRedeemedAt(now: Date, purpose: VerificationPurpose): Result<void, VerificationFailure> {
    if (this.props.purpose !== purpose) return err({ _tag: 'TokenPurposeMismatch' });
    if (this.props.consumedAt !== null) return err({ _tag: 'TokenAlreadyUsed' });
    if (this.props.expiresAt <= now) return err({ _tag: 'TokenExpired' });
    return ok(undefined);
  }

  /** Marks the token spent. Idempotent, so a double submit cannot re-open it. */
  consume(now: Date): void {
    if (this.props.consumedAt !== null) return;
    this.props = { ...this.props, consumedAt: now };
  }

  snapshot(): Readonly<VerificationTokenProps> {
    return { ...this.props };
  }
}
