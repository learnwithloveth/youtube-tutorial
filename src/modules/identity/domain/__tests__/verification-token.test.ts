import { describe, expect, it } from 'vitest';

import { toUserId } from '@/shared/kernel/ids';

import {
  TOKEN_LIFETIME_MS,
  VerificationToken,
  type VerificationPurpose,
} from '../verification-token';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const USER = toUserId('11111111-1111-4111-8111-111111111111');

function issue(purpose: VerificationPurpose = 'email-verification', at: Date = NOW) {
  return VerificationToken.issue({
    id: 'token-1',
    userId: USER,
    purpose,
    tokenHash: 'digest',
    now: at,
  });
}

function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

describe('VerificationToken', () => {
  it('expires after the lifetime for its purpose', () => {
    const token = issue('password-reset');
    expect(token.expiresAt.getTime() - NOW.getTime()).toBe(TOKEN_LIFETIME_MS['password-reset']);
  });

  it('gives a password reset a much shorter window than an address confirmation', () => {
    // A reset link hands over the account; a confirmation link does not. They must
    // not share a lifetime.
    expect(TOKEN_LIFETIME_MS['password-reset']).toBeLessThan(
      TOKEN_LIFETIME_MS['email-verification'],
    );
  });

  it('can be redeemed inside its window', () => {
    const token = issue();
    expect(token.canBeRedeemedAt(minutesAfter(NOW, 60), 'email-verification').ok).toBe(true);
  });

  it('refuses redemption after expiry', () => {
    const token = issue('password-reset');
    const result = token.canBeRedeemedAt(minutesAfter(NOW, 16), 'password-reset');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TokenExpired');
  });

  it('treats the exact expiry instant as expired', () => {
    const token = issue('password-reset');
    const result = token.canBeRedeemedAt(token.expiresAt, 'password-reset');

    expect(result.ok).toBe(false);
  });

  it('refuses a token issued for a different purpose', () => {
    // The attack this prevents: replaying a long-lived, widely-scanned email
    // confirmation link against the password reset endpoint.
    const token = issue('email-verification');
    const result = token.canBeRedeemedAt(NOW, 'password-reset');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TokenPurposeMismatch');
  });

  it('cannot be redeemed twice', () => {
    const token = issue();
    token.consume(NOW);

    const result = token.canBeRedeemedAt(minutesAfter(NOW, 1), 'email-verification');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TokenAlreadyUsed');
  });

  it('keeps the first consumption time when consumed again', () => {
    // A double-submitted form must not re-open or re-stamp a spent token.
    const token = issue();
    token.consume(NOW);
    token.consume(minutesAfter(NOW, 5));

    expect(token.consumedAt).toEqual(NOW);
  });

  it('never exposes the token itself, only its digest', () => {
    const token = issue();
    const snapshot = token.snapshot();

    expect(snapshot.tokenHash).toBe('digest');
    expect(Object.keys(snapshot)).not.toContain('token');
  });
});
