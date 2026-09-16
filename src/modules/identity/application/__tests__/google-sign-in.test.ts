import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';

import { EmailAddress } from '../../domain/email-address';
import { PasswordHash } from '../../domain/password';
import { User } from '../../domain/user';
import type { IdentityDependencies, ProviderProfile } from '../ports';
import {
  createConnectGoogle,
  createDisconnectGoogle,
} from '../use-cases/google-connection';
import { createSignInWithGoogle } from '../use-cases/sign-in-with-google';
import { FakeConnectedAccounts } from './fake-connected-accounts';
import { fakeSealer, FakeHasher, FakeProfiles, FakeSessions, FakeUsers } from './fake-identity';

/**
 * Signing in with Google, against in-memory ports.
 *
 * The cases worth writing down are the ones where an account changes hands: an
 * address the provider has not confirmed, a Google account already claimed by
 * somebody else, and a disconnect that would leave no way back in.
 */

const NOW = new Date('2026-09-16T12:00:00.000Z');

function makeDeps(now = NOW) {
  const users = new FakeUsers();
  const sessions = new FakeSessions();
  const connectedAccounts = new FakeConnectedAccounts();

  // Only the ports these use cases touch. Supplying a mail sender and a document
  // store to test a sign-in would be noise — the same arrangement the verification
  // flow tests use.
  const deps = {
    users,
    sessions,
    connectedAccounts,
    profiles: new FakeProfiles(),
    hasher: new FakeHasher(),
    sealer: fakeSealer,
    digest: { hash: (value: string) => `d:${value}` },
    clock: fixedClock(now),
  } as unknown as IdentityDependencies;

  return { deps, users, sessions, connectedAccounts };
}

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    providerAccountId: 'google-sub-1',
    email: 'ada@example.com',
    emailVerified: true,
    ...overrides,
  };
}

async function seedPasswordUser(users: FakeUsers, email: string): Promise<User> {
  const user = User.register({
    id: users.nextId(),
    email: EmailAddress.parseOrThrow(email),
    passwordHash: PasswordHash.fromEncoded('fake$correct-horse-battery'),
    now: NOW,
  });
  await users.insertIfEmailFree(user);
  return user;
}

describe('signing in with Google', () => {
  it('creates an account with no password and an already-confirmed address', async () => {
    const { deps, users, connectedAccounts } = makeDeps();

    const result = await createSignInWithGoogle(deps)({ profile: profile() });

    expect(result.ok).toBe(true);
    expect(users.store.size).toBe(1);

    const [created] = [...users.store.values()];
    expect(created?.hasPassword).toBe(false);
    // Google confirmed the address, so asking them to confirm it again by mail
    // would be asking them to prove what they have just proved.
    expect(created?.isEmailVerified).toBe(true);
    expect(connectedAccounts.store).toHaveLength(1);
    expect(connectedAccounts.store[0]?.providerAccountId).toBe('google-sub-1');
  });

  it('signs the same account in on the second visit, rather than making another', async () => {
    const { deps, users, sessions } = makeDeps();
    const signIn = createSignInWithGoogle(deps);

    await signIn({ profile: profile() });
    const second = await signIn({ profile: profile() });

    expect(second.ok).toBe(true);
    expect(users.store.size).toBe(1);
    expect(sessions.store.size).toBe(2);
  });

  it('links to an existing account when the confirmed address matches', async () => {
    const { deps, users, connectedAccounts } = makeDeps();
    const existing = await seedPasswordUser(users, 'ada@example.com');

    const result = await createSignInWithGoogle(deps)({ profile: profile() });

    expect(result.ok).toBe(true);
    expect(users.store.size).toBe(1);
    expect(connectedAccounts.store[0]?.userId).toBe(existing.id);
    // Linking adds a way in; it does not take the password away.
    expect(users.store.get(existing.id)?.hasPassword).toBe(true);
  });

  it('refuses an address Google has not confirmed, and writes nothing', async () => {
    const { deps, users, connectedAccounts } = makeDeps();

    const result = await createSignInWithGoogle(deps)({
      profile: profile({ emailVerified: false }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ProviderEmailUnverified');
    // The whole point: an unconfirmed address must not create or reach an account.
    expect(users.store.size).toBe(0);
    expect(connectedAccounts.store).toHaveLength(0);
  });

  it('still refuses an unconfirmed address that matches somebody else', async () => {
    const { deps, users, connectedAccounts } = makeDeps();
    await seedPasswordUser(users, 'ada@example.com');

    const result = await createSignInWithGoogle(deps)({
      profile: profile({ emailVerified: false }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ProviderEmailUnverified');
    expect(connectedAccounts.store).toHaveLength(0);
  });

  it('follows the provider subject, so a changed Google address is the same account', async () => {
    const { deps, users } = makeDeps();
    const signIn = createSignInWithGoogle(deps);

    await signIn({ profile: profile() });
    const moved = await signIn({ profile: profile({ email: 'ada@newdomain.example' }) });

    expect(moved.ok).toBe(true);
    expect(users.store.size).toBe(1);
  });

  it('refuses a disabled account', async () => {
    const { deps, users } = makeDeps();
    const user = await seedPasswordUser(users, 'ada@example.com');
    user.suspend();
    await users.save(user);

    const result = await createSignInWithGoogle(deps)({ profile: profile() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('AccountDisabled');
  });

  it('lets a locked-out account in, and clears the lock', async () => {
    const { deps, users } = makeDeps();
    const user = await seedPasswordUser(users, 'ada@example.com');
    for (let attempt = 0; attempt < 5; attempt++) user.recordFailedAttempt(NOW);
    await users.save(user);
    expect(user.status).toBe('locked');

    const result = await createSignInWithGoogle(deps)({ profile: profile() });

    // The lock exists to stop password guessing. Somebody arriving with a Google
    // assertion is not guessing, and leaving them locked out would let anybody
    // deny a stranger their own sign-in by failing five passwords.
    expect(result.ok).toBe(true);
    expect(users.store.get(user.id)?.status).toBe('active');
  });
});

describe('connecting Google from the security page', () => {
  it('refuses a Google account that belongs to somebody else', async () => {
    const { deps, users, connectedAccounts } = makeDeps();
    await createSignInWithGoogle(deps)({ profile: profile() });
    const other = await seedPasswordUser(users, 'grace@example.com');

    const result = await createConnectGoogle(deps)({ userId: other.id, profile: profile() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ProviderAccountLinkedElsewhere');
    expect(connectedAccounts.store).toHaveLength(1);
  });

  it('refuses a second Google account on one user', async () => {
    const { deps, users } = makeDeps();
    const user = await seedPasswordUser(users, 'ada@example.com');
    await createConnectGoogle(deps)({ userId: user.id, profile: profile() });

    const second = await createConnectGoogle(deps)({
      userId: user.id,
      profile: profile({ providerAccountId: 'google-sub-2', email: 'ada2@example.com' }),
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error._tag).toBe('ProviderAlreadyConnected');
  });

  it('refuses to disconnect the only way in', async () => {
    const { deps, users, connectedAccounts } = makeDeps();
    await createSignInWithGoogle(deps)({ profile: profile() });
    const [created] = [...users.store.values()];

    const result = await createDisconnectGoogle(deps)(created!.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('LastSignInMethod');
    // Still connected: the refusal has to leave the account reachable.
    expect(connectedAccounts.store).toHaveLength(1);
  });

  it('disconnects once a password exists', async () => {
    const { deps, users, connectedAccounts } = makeDeps();
    const user = await seedPasswordUser(users, 'ada@example.com');
    await createConnectGoogle(deps)({ userId: user.id, profile: profile() });

    const result = await createDisconnectGoogle(deps)(user.id);

    expect(result.ok).toBe(true);
    expect(connectedAccounts.store).toHaveLength(0);
  });
});
