/**
 * EmailAddress — a validated, normalised email.
 *
 * Pure domain. No framework, no I/O.
 *
 * Normalisation matters for security, not tidiness: `Alice@Example.com` and
 * `alice@example.com` are the same account. Without a canonical form you get
 * duplicate registrations, and a login lookup that misses lets an attacker create a
 * near-duplicate of someone else's identity.
 */

import { err, ok, type Result } from '@/shared/kernel/result';

export type EmailParseError =
  | { _tag: 'EmailMalformed'; input: string }
  | { _tag: 'EmailTooLong'; length: number };

/**
 * Deliberately permissive. Full RFC 5322 is famously unenforceable by regex, and an
 * over-strict pattern rejects valid addresses (a real support cost). Deliverability
 * is proven by sending a verification mail, not by a regular expression.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const MAX_LENGTH = 254; // RFC 5321 practical maximum

export class EmailAddress {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static parse(input: string): Result<EmailAddress, EmailParseError> {
    const normalised = input.trim().toLowerCase();

    if (normalised.length > MAX_LENGTH) {
      return err({ _tag: 'EmailTooLong', length: normalised.length });
    }
    if (!EMAIL_PATTERN.test(normalised)) {
      return err({ _tag: 'EmailMalformed', input });
    }
    return ok(new EmailAddress(normalised));
  }

  static parseOrThrow(input: string): EmailAddress {
    const result = EmailAddress.parse(input);
    if (!result.ok) throw new TypeError(`Invalid email address: "${input}"`);
    return result.value;
  }

  get domain(): string {
    return this.value.slice(this.value.indexOf('@') + 1);
  }

  /**
   * Obscured form for logs and error messages.
   * A raw email in a log is personal data; this keeps entries correlatable without
   * storing the address itself in a place with a long retention policy.
   */
  masked(): string {
    const at = this.value.indexOf('@');
    const local = this.value.slice(0, at);
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(1, local.length - 1))}@${this.domain}`;
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
