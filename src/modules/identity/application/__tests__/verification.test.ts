import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';
import { toUserId } from '@/shared/kernel/ids';

import { EmailAddress } from '../../domain/email-address';
import { PASSWORD_MIN_LENGTH } from '../../domain/password';
import { Session, type SessionId } from '../../domain/session';
import { User } from '../../domain/user';
import { VerificationToken } from '../../domain/verification-token';
import type { IdentityDependencies, PasswordHasher } from '../ports';
import { FakeConnectedAccounts } from './fake-connected-accounts';
import {
  fakeSealer,
  fakeUrls,
  FakeHasher,
  FakeProfiles,
  FakeSessions,
  FakeTokenHasher,
  FakeTokens,
  FakeUsers,
  RecordingEmailSender,
} from './fake-identity';
import { createResetPassword } from '../use-cases/reset-password';
import {
  createConfirmEmail,
  createRequestPasswordReset,
} from '../use-cases/verify-email';
import { FakeDocuments, FakeVerifications } from './fake-verifications';

/**
 * The verification and reset flows, against in-memory adapters.
 *
 * No database, no SMTP, no crypto cost — and yet every rule that matters is
 * exercised: token scoping, single use, expiry, session revocation on reset, and
 * the absence of an enumeration oracle. That is the return on declaring ports.
 */

/** One character under the policy minimum, whatever that minimum currently is. */
const TOO_SHORT = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
const NOW = new Date('2026-09-09T12:00:00.000Z');
const USER_ID = toUserId('11111111-1111-4111-8111-111111111111');


function makeDeps(now = NOW) {
  const users = new FakeUsers({ fixedId: USER_ID });
  const sessions = new FakeSessions();
  const tokens = new FakeTokens();
  const email = new RecordingEmailSender();
  const tokenHasher = new FakeTokenHasher();

  const deps: IdentityDependencies = {
    users,
    profiles: new FakeProfiles(),
    sessions,
    connectedAccounts: new FakeConnectedAccounts(),
    tokens,
    verifications: new FakeVerifications(),
    documents: new FakeDocuments(),
    hasher: new FakeHasher(),
    tokenHasher,
    sealer: fakeSealer,
    digest: { hash: (value) => `d:${value}` },
    email,
    urls: fakeUrls,
    siteName: 'Novex',
    clock: fixedClock(now),
  };

  return { deps, users, sessions, tokens, email, tokenHasher };
}

async function seedUser(users: FakeUsers, hasher: PasswordHasher): Promise<User> {
  const user = User.register({
    id: USER_ID,
    email: EmailAddress.parseOrThrow('ada@example.com'),
    externalId: "",
    accountNumber: users.nextAccountNumber(),
    passwordHash: await hasher.hash('correct-horse-battery'),
    now: NOW,
  });
  await users.save(user);
  return user;
}

describe('confirmEmail', () => {
  it('marks the address verified and spends the token', async () => {
    const { deps, users, tokens, tokenHasher } = makeDeps();
    const user = await seedUser(users, deps.hasher);

    const { token, tokenHash } = tokenHasher.generate();
    await tokens.save(
      VerificationToken.issue({
        id: 'r1',
        userId: user.id,
        purpose: 'email-verification',
        tokenHash,
        now: NOW,
      }),
    );

    const result = await createConfirmEmail(deps)(token);

    expect(result.ok).toBe(true);
    expect(users.store.get(USER_ID)?.isEmailVerified).toBe(true);
    expect(tokens.store.get(tokenHash)?.consumedAt).toEqual(NOW);
  });

  it('rejects the same link a second time', async () => {
    const { deps, users, tokens, tokenHasher } = makeDeps();
    const user = await seedUser(users, deps.hasher);

    const { token, tokenHash } = tokenHasher.generate();
    await tokens.save(
      VerificationToken.issue({
        id: 'r1',
        userId: user.id,
        purpose: 'email-verification',
        tokenHash,
        now: NOW,
      }),
    );

    const confirmEmail = createConfirmEmail(deps);
    await confirmEmail(token);
    const second = await confirmEmail(token);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error._tag).toBe('VerificationTokenInvalid');
  });

  it('refuses a password-reset token presented as a verification link', async () => {
    const { deps, users, tokens, tokenHasher } = makeDeps();
    const user = await seedUser(users, deps.hasher);

    const { token, tokenHash } = tokenHasher.generate();
    await tokens.save(
      VerificationToken.issue({
        id: 'r1',
        userId: user.id,
        purpose: 'password-reset',
        tokenHash,
        now: NOW,
      }),
    );

    const result = await createConfirmEmail(deps)(token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('VerificationTokenInvalid');
    expect(users.store.get(USER_ID)?.isEmailVerified).toBe(false);
  });

  it('reports an unknown token as invalid rather than throwing', async () => {
    const { deps } = makeDeps();
    const result = await createConfirmEmail(deps)('never-issued');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('VerificationTokenInvalid');
  });

  it('reports an expired token distinctly, because that has a remedy', async () => {
    const { deps, users, tokens, tokenHasher } = makeDeps(
      new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
    );
    const user = await seedUser(users, deps.hasher);

    const { token, tokenHash } = tokenHasher.generate();
    await tokens.save(
      VerificationToken.issue({
        id: 'r1',
        userId: user.id,
        purpose: 'email-verification',
        tokenHash,
        now: NOW,
      }),
    );

    const result = await createConfirmEmail(deps)(token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('VerificationTokenExpired');
  });
});

describe('requestPasswordReset', () => {
  it('mails a reset link to a registered address', async () => {
    const { deps, users, email } = makeDeps();
    await seedUser(users, deps.hasher);

    await createRequestPasswordReset(deps)('ada@example.com');

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.subject).toMatch(/reset/i);
    expect(email.sent[0]?.text).toContain('https://novex.test/reset-password?token=');
  });

  it('sends nothing for an unregistered address, and reports the same either way', async () => {
    // The absence of an enumeration oracle. The caller cannot tell these apart,
    // which is the entire point of the use case returning void.
    const { deps, email } = makeDeps();

    await expect(createRequestPasswordReset(deps)('nobody@example.com')).resolves.toBeUndefined();
    expect(email.sent).toHaveLength(0);
  });

  it('supersedes an outstanding link when a second is requested', async () => {
    const { deps, users, tokens, email } = makeDeps();
    await seedUser(users, deps.hasher);

    const request = createRequestPasswordReset(deps);
    await request('ada@example.com');
    await request('ada@example.com');

    const live = [...tokens.store.values()].filter((token) => token.consumedAt === null);
    expect(email.sent).toHaveLength(2);
    // Only the newest link still works; the first was killed on reissue.
    expect(live).toHaveLength(1);
  });

  it('normalises the address, so casing does not hide an account', async () => {
    const { deps, users, email } = makeDeps();
    await seedUser(users, deps.hasher);

    await createRequestPasswordReset(deps)('  Ada@Example.COM  ');

    expect(email.sent).toHaveLength(1);
  });
});

describe('resetPassword', () => {
  let context: ReturnType<typeof makeDeps>;
  let token: string;

  beforeEach(async () => {
    context = makeDeps();
    const user = await seedUser(context.users, context.deps.hasher);

    const issued = context.tokenHasher.generate();
    token = issued.token;
    await context.tokens.save(
      VerificationToken.issue({
        id: 'r1',
        userId: user.id,
        purpose: 'password-reset',
        tokenHash: issued.tokenHash,
        now: NOW,
      }),
    );
  });

  it('replaces the password and spends the token', async () => {
    const result = await createResetPassword(context.deps)({
      token,
      newPassword: 'a-much-better-passphrase',
    });

    expect(result.ok).toBe(true);
    const stored = context.users.store.get(USER_ID);
    expect(
      await context.deps.hasher.verify('a-much-better-passphrase', stored!.passwordHash!),
    ).toBe(true);
  });

  it('revokes every existing session', async () => {
    // The rule that makes a reset an actual remedy: an attacker holding a live
    // session must be forced back to a login they can no longer pass.
    const session = Session.issue({ id: 'live' as SessionId, userId: USER_ID, now: NOW });
    await context.sessions.save(session);

    await createResetPassword(context.deps)({ token, newPassword: 'a-much-better-passphrase' });

    expect(context.sessions.revokedCalls).toBe(1);
    expect(context.sessions.store.get('live')?.revokedAt).toEqual(NOW);
  });

  it('confirms the address, since clicking the link proved receipt', async () => {
    await createResetPassword(context.deps)({ token, newPassword: 'a-much-better-passphrase' });

    expect(context.users.store.get(USER_ID)?.isEmailVerified).toBe(true);
  });

  it('rejects a password that fails policy, leaving the link usable', async () => {
    const result = await createResetPassword(context.deps)({ token, newPassword: TOO_SHORT });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PasswordTooShort');
    // Nothing was consumed, so the user can try again with the same link.
    expect([...context.tokens.store.values()][0]?.consumedAt).toBeNull();
  });

  it('cannot be replayed', async () => {
    const reset = createResetPassword(context.deps);
    await reset({ token, newPassword: 'a-much-better-passphrase' });
    const second = await reset({ token, newPassword: 'attacker-chosen-password' });

    expect(second.ok).toBe(false);
    const stored = context.users.store.get(USER_ID);
    expect(
      await context.deps.hasher.verify('a-much-better-passphrase', stored!.passwordHash!),
    ).toBe(true);
  });

  it('clears a lockout, so a locked-out user can recover', async () => {
    const user = context.users.store.get(USER_ID)!;
    for (let i = 0; i < 5; i += 1) user.recordFailedAttempt(NOW);
    expect(user.isLockedAt(NOW)).toBe(true);

    await createResetPassword(context.deps)({ token, newPassword: 'a-much-better-passphrase' });

    expect(context.users.store.get(USER_ID)?.isLockedAt(NOW)).toBe(false);
  });
});
