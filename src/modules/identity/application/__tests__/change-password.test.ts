import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';

import { EmailAddress } from '../../domain/email-address';
import { PASSWORD_MIN_LENGTH, PasswordHash } from '../../domain/password';
import { Session, STEP_UP_WINDOW_MS } from '../../domain/session';
import { User } from '../../domain/user';
import type { IdentityDependencies } from '../ports';
import { createChangePassword } from '../use-cases/change-password';

/** One character under the policy minimum, whatever that minimum currently is. */
const TOO_SHORT = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);

import { FakeConnectedAccounts } from './fake-connected-accounts';
import { fakeSealer, FakeHasher, FakeProfiles, FakeSessions, FakeUsers } from './fake-identity';

/**
 * Changing a password from inside the application.
 *
 * Two proofs are accepted and no others: the current password, or — for an account
 * created through a provider, which has none — a session that authenticated inside
 * the step-up window. Everything else here is about what survives the change: the
 * caller's own session, and nobody else's.
 */

const NOW = new Date('2026-09-16T12:00:00.000Z');
const CURRENT = 'correct-horse-battery';
const NEXT_ONE = 'a-much-better-passphrase';

function makeDeps(now = NOW) {
  const users = new FakeUsers();
  const sessions = new FakeSessions();

  const deps = {
    users,
    sessions,
    connectedAccounts: new FakeConnectedAccounts(),
    profiles: new FakeProfiles(),
    hasher: new FakeHasher(),
    sealer: fakeSealer,
    digest: { hash: (value: string) => `d:${value}` },
    clock: fixedClock(now),
  } as unknown as IdentityDependencies;

  return { deps, users, sessions };
}

async function seed(
  users: FakeUsers,
  sessions: FakeSessions,
  options: { withPassword: boolean; authenticatedAt?: Date },
) {
  const user = options.withPassword
    ? User.register({
        id: users.nextId(),
        email: EmailAddress.parseOrThrow('ada@example.com'),
        accountNumber: users.nextAccountNumber(),
        passwordHash: PasswordHash.fromEncoded(`fake$${CURRENT}`),
        now: NOW,
      })
    : User.registerWithProvider({
        id: users.nextId(),
        email: EmailAddress.parseOrThrow('ada@example.com'),
        accountNumber: users.nextAccountNumber(),
        now: NOW,
      });
  await users.insertIfEmailFree(user);

  const session = Session.issue({
    id: sessions.nextId(),
    userId: user.id,
    now: options.authenticatedAt ?? NOW,
  });
  await sessions.save(session);

  return { user, session, sealed: await fakeSealer.seal(session.id) };
}

describe('changing a password', () => {
  it('refuses the wrong current password and changes nothing', async () => {
    const { deps, users, sessions } = makeDeps();
    const { user, sealed } = await seed(users, sessions, { withPassword: true });

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: 'not-the-password',
      newPassword: NEXT_ONE,
      sealedSession: sealed,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CurrentPasswordIncorrect');
    expect(users.store.get(user.id)?.passwordHash?.encoded).toBe(`fake$${CURRENT}`);
  });

  it('replaces the password and signs out every other session but this one', async () => {
    const { deps, users, sessions } = makeDeps();
    const { user, session, sealed } = await seed(users, sessions, { withPassword: true });

    const elsewhere = Session.issue({ id: sessions.nextId(), userId: user.id, now: NOW });
    await sessions.save(elsewhere);

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: CURRENT,
      newPassword: NEXT_ONE,
      sealedSession: sealed,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revokedSessions).toBe(1);
    expect(users.store.get(user.id)?.passwordHash?.encoded).toBe(`fake$${NEXT_ONE}`);
    // The other device is out; the one doing the changing stays signed in, because
    // signing it out only makes the person log in again.
    expect(sessions.store.get(elsewhere.id)?.revokedAt).toEqual(NOW);
    expect(sessions.store.get(session.id)?.revokedAt).toBeNull();
  });

  it('refuses a new password that fails policy', async () => {
    const { deps, users, sessions } = makeDeps();
    const { user, sealed } = await seed(users, sessions, { withPassword: true });

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: CURRENT,
      newPassword: TOO_SHORT,
      sealedSession: sealed,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PasswordTooShort');
    expect(users.store.get(user.id)?.passwordHash?.encoded).toBe(`fake$${CURRENT}`);
  });

  it('refuses the password they already have', async () => {
    const { deps, users, sessions } = makeDeps();
    const { user, sealed } = await seed(users, sessions, { withPassword: true });

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: CURRENT,
      newPassword: CURRENT,
      sealedSession: sealed,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PasswordUnchanged');
  });

  it('refuses a session that is not this account’s', async () => {
    const { deps, users, sessions } = makeDeps();
    const { user } = await seed(users, sessions, { withPassword: true });

    const stranger = Session.issue({
      id: sessions.nextId(),
      userId: 'someone-else' as typeof user.id,
      now: NOW,
    });
    await sessions.save(stranger);

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: CURRENT,
      newPassword: NEXT_ONE,
      sealedSession: await fakeSealer.seal(stranger.id),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SessionInvalid');
  });
});

describe('setting a first password on a Google account', () => {
  it('accepts a recently authenticated session in place of a current password', async () => {
    const { deps, users, sessions } = makeDeps();
    const { user, sealed } = await seed(users, sessions, { withPassword: false });

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: null,
      newPassword: NEXT_ONE,
      sealedSession: sealed,
    });

    expect(result.ok).toBe(true);
    expect(users.store.get(user.id)?.hasPassword).toBe(true);
  });

  it('refuses a stale session, because nothing else proves it is them', async () => {
    const authenticatedAt = new Date(NOW.getTime() - STEP_UP_WINDOW_MS - 1000);
    const { deps, users, sessions } = makeDeps();
    const { user, sealed } = await seed(users, sessions, {
      withPassword: false,
      authenticatedAt,
    });

    const result = await createChangePassword(deps)({
      userId: user.id,
      currentPassword: null,
      newPassword: NEXT_ONE,
      sealedSession: sealed,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A borrowed laptop is exactly this case: a live session, and nobody who can
    // prove they are the account holder.
    expect(result.error._tag).toBe('StepUpRequired');
    expect(users.store.get(user.id)?.hasPassword).toBe(false);
  });
});
