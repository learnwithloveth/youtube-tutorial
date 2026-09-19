import { describe, expect, it } from 'vitest';

import { AccountNumber } from '../account-number';
import { EmailAddress } from '../email-address';
import { PasswordHash, validatePasswordPolicy, PASSWORD_MIN_LENGTH } from '../password';
import { MAX_FAILED_ATTEMPTS, User } from '../user';
import {
  Session,
  SESSION_IDLE_TIMEOUT_MS,
  STEP_UP_WINDOW_MS,
  type SessionId,
} from '../session';
import type { UserId } from '@/shared/kernel/ids';

const anEmail = () => EmailAddress.parseOrThrow('alice@example.com');
const aHash = () => PasswordHash.fromEncoded('scrypt$65536$8$1$c2FsdA$a2V5');
const T0 = new Date('2026-01-01T00:00:00Z');

function aUser(now = T0) {
  return User.register({
    id: '11111111-1111-4111-8111-111111111111' as UserId,
    email: anEmail(),
    accountNumber: AccountNumber.parseOrThrow('1234567890'),
    passwordHash: aHash(),
    now,
  });
}

describe('EmailAddress', () => {
  it('normalises case and surrounding whitespace', () => {
    // Without this, Alice@Example.com and alice@example.com are two accounts.
    expect(EmailAddress.parseOrThrow('  Alice@Example.COM ').value).toBe('alice@example.com');
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', 'alice', 'alice@', '@example.com', 'a b@example.com', 'a@b']) {
      expect(EmailAddress.parse(bad).ok).toBe(false);
    }
  });

  it('rejects addresses beyond the RFC 5321 practical limit', () => {
    const tooLong = `${'a'.repeat(250)}@example.com`;
    const result = EmailAddress.parse(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('EmailTooLong');
  });

  it('masks the local part for logging', () => {
    // A raw email in a long-retention log is personal data.
    expect(anEmail().masked()).toBe('a****@example.com');
  });
});

describe('password policy', () => {
  it('requires length rather than character classes', () => {
    // NIST SP 800-63B advises against composition rules: they produce Password1!
    expect(validatePasswordPolicy('correct horse battery staple').ok).toBe(true);
    // All-lowercase, no digit, no symbol — and accepted, because composition is
    // not a rule here. Only length and the blocklist are.
    expect(validatePasswordPolicy('abcdef').ok).toBe(true);
    expect(validatePasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH - 1)).ok).toBe(false);
  });

  it('rejects anything under the minimum', () => {
    const result = validatePasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('PasswordTooShort');
  });

  it('rejects known-common passwords', () => {
    const result = validatePasswordPolicy('password123');
    expect(result.ok).toBe(false);
  });

  it('never reveals the hash through string coercion', () => {
    const hash = aHash();
    expect(String(hash)).toBe('[redacted]');
    expect(JSON.stringify({ hash })).not.toContain('c2FsdA');
  });
});

describe('User lockout', () => {
  it('locks the account after the configured number of failures', () => {
    const user = aUser();
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(user.canAttemptAuthentication(T0).ok).toBe(true);
      user.recordFailedAttempt(T0);
    }
    const blocked = user.canAttemptAuthentication(T0);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error._tag).toBe('AccountLocked');
  });

  it('unlocks on its own once the window passes', () => {
    // A permanent lock would turn a guessing attempt against someone else's
    // account into a denial of service against that person.
    const user = aUser();
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      user.recordFailedAttempt(T0);
    }
    const later = new Date(T0.getTime() + 16 * 60 * 1000);
    expect(user.canAttemptAuthentication(later).ok).toBe(true);
  });

  it('clears the counter after a success', () => {
    const user = aUser();
    user.recordFailedAttempt(T0);
    user.recordFailedAttempt(T0);
    user.recordSuccessfulAuthentication();
    expect(user.failedAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it('keeps a disabled account unusable regardless of the counter', () => {
    const user = User.rehydrate({ ...aUser().snapshot(), status: 'disabled' });
    const result = user.canAttemptAuthentication(T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('AccountDisabled');
  });

  it('treats email verification as idempotent', () => {
    const user = aUser();
    user.verifyEmail(T0);
    const first = user.emailVerifiedAt;
    user.verifyEmail(new Date(T0.getTime() + 60_000));
    expect(user.emailVerifiedAt).toEqual(first);
  });
});

describe('Session', () => {
  const aSession = (now = T0) =>
    Session.issue({
      id: 'session-1' as SessionId,
      userId: '11111111-1111-4111-8111-111111111111' as UserId,
      now,
    });

  it('is valid immediately after issue', () => {
    expect(aSession().validateAt(T0).ok).toBe(true);
  });

  it('expires after the idle timeout', () => {
    const session = aSession();
    const idle = new Date(T0.getTime() + SESSION_IDLE_TIMEOUT_MS + 1_000);
    const result = session.validateAt(idle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('SessionExpired');
  });

  it('is invalid once revoked, even before it expires', () => {
    // This is the whole reason sessions are server-side rows rather than bare JWTs.
    const session = aSession();
    session.revoke(T0);
    const result = session.validateAt(T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('SessionRevoked');
  });

  it('requires step-up for money movement once the window lapses', () => {
    const session = aSession();
    const later = new Date(T0.getTime() + STEP_UP_WINDOW_MS + 1_000);

    // Still fine for ordinary browsing...
    expect(session.validateAt(later).ok).toBe(true);

    // ...but not for anything that moves funds.
    const stepUp = session.validateForStepUpAt(later);
    expect(stepUp.ok).toBe(false);
    if (!stepUp.ok) expect(stepUp.error._tag).toBe('StepUpRequired');
  });

  it('reopens the step-up window on re-authentication', () => {
    const session = aSession();
    const later = new Date(T0.getTime() + STEP_UP_WINDOW_MS + 1_000);
    session.reauthenticate(later);
    expect(session.validateForStepUpAt(later).ok).toBe(true);
  });

  it('only reports a write when the idle window has actually moved', () => {
    // Touching the row on every request would make each page view a database write.
    const session = aSession();
    expect(session.touch(new Date(T0.getTime() + 5_000))).toBe(false);
    expect(session.touch(new Date(T0.getTime() + 61_000))).toBe(true);
  });

  it('treats revocation as idempotent', () => {
    const session = aSession();
    session.revoke(T0);
    const first = session.revokedAt;
    session.revoke(new Date(T0.getTime() + 60_000));
    expect(session.revokedAt).toEqual(first);
  });
});
