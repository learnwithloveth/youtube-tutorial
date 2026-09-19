/**
 * Password policy and the stored hash representation.
 *
 * Pure domain: this file states the RULES and the SHAPE of a stored credential. The
 * actual key derivation is a port (`PasswordHasher`), because hashing is I/O-bound,
 * CPU-bound, and swappable — and because a pure domain must stay testable in
 * microseconds rather than deliberately taking 100ms per call.
 */

import { err, ok, type Result } from '@/shared/kernel/result';

export type PasswordPolicyError =
  | { _tag: 'PasswordTooShort'; minimum: number }
  | { _tag: 'PasswordTooLong'; maximum: number }
  | { _tag: 'PasswordTooCommon' };

/**
 * Length is the requirement; composition rules are not.
 *
 * NIST SP 800-63B explicitly recommends against mandatory character-class rules:
 * they push people toward `Password1!` — predictable to an attacker, hard for a
 * human — while adding little entropy. A blocklist of known-breached values is the
 * part of that guidance we still follow.
 *
 * ── The minimum is 4, and that is a product decision, not a security one ───────
 * It was 12, which is what SP 800-63B asks of a memorised secret. The product
 * asked for 4: people were abandoning sign-up at the password field. Four
 * characters is inside brute-force range and no comment here can argue otherwise —
 * what carries the account's safety now is everything around the password: the
 * sign-in rate limit, the blocklist below, and the fact that a session is only
 * ever issued by a real sign-in. Raise this the day sign-up conversion stops
 * being the binding constraint.
 */
export const PASSWORD_MIN_LENGTH = 4;

/**
 * 72 bytes is bcrypt's silent truncation point. We use scrypt, which has no such
 * limit, but capping here keeps the door open to changing algorithm later without a
 * migration where long passwords silently stop matching. It also bounds the work an
 * unauthenticated caller can force us to do.
 */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Illustrative blocklist. In production this is a lookup against a breach corpus
 * (Have I Been Pwned's k-anonymity range API is free and never receives the
 * password itself — only a 5-character SHA-1 prefix).
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password123', 'passw0rd', '123456789012', 'qwertyuiop12',
  'letmein12345', 'administrator', 'iloveyou1234', 'welcome12345',
]);

export function validatePasswordPolicy(plaintext: string): Result<void, PasswordPolicyError> {
  if (plaintext.length < PASSWORD_MIN_LENGTH) {
    return err({ _tag: 'PasswordTooShort', minimum: PASSWORD_MIN_LENGTH });
  }
  if (plaintext.length > PASSWORD_MAX_LENGTH) {
    return err({ _tag: 'PasswordTooLong', maximum: PASSWORD_MAX_LENGTH });
  }
  if (COMMON_PASSWORDS.has(plaintext.toLowerCase())) {
    return err({ _tag: 'PasswordTooCommon' });
  }
  return ok(undefined);
}

/**
 * An opaque stored credential.
 *
 * It carries the algorithm and parameters used, so raising the cost factor later
 * does not invalidate existing hashes: an old credential still verifies against its
 * own recorded parameters, and is transparently re-hashed on next successful login.
 * Without this the only options are a forced password reset for every user, or being
 * stuck on the original parameters forever.
 */
export class PasswordHash {
  private constructor(readonly encoded: string) {
    Object.freeze(this);
  }

  /** `encoded` is the hasher's self-describing output; only it may interpret this. */
  static fromEncoded(encoded: string): PasswordHash {
    if (encoded.length === 0) throw new TypeError('PasswordHash cannot be empty');
    return new PasswordHash(encoded);
  }

  toString(): string {
    return '[redacted]';
  }

  /**
   * Guards against the hash reaching a log or an API response through casual
   * serialisation. Not a substitute for it never leaving the identity module.
   */
  toJSON(): string {
    return '[redacted]';
  }
}
