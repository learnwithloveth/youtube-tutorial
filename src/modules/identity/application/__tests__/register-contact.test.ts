import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';

import type { IdentityDependencies } from '../ports';
import { createRegisterUser } from '../use-cases/register-user';
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

/**
 * What sign-up keeps besides the credential.
 *
 * The country used to be a select with eight options that nothing read: whatever
 * somebody chose was dropped on the floor. These tests are the reason it cannot go
 * back to that quietly.
 */

const NOW = new Date('2026-09-16T12:00:00.000Z');

function makeDeps() {
  const users = new FakeUsers();
  const profiles = new FakeProfiles();

  const deps = {
    users,
    profiles,
    sessions: new FakeSessions(),
    connectedAccounts: new FakeConnectedAccounts(),
    tokens: new FakeTokens(),
    hasher: new FakeHasher(),
    tokenHasher: new FakeTokenHasher(),
    sealer: fakeSealer,
    digest: { hash: (value: string) => `d:${value}` },
    email: new RecordingEmailSender(),
    urls: fakeUrls,
    clock: fixedClock(NOW),
  } as unknown as IdentityDependencies;

  return { deps, users, profiles };
}

const VALID = {
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

describe('registering with a country and a phone number', () => {
  it('keeps both on the profile', async () => {
    const { deps, profiles } = makeDeps();

    const result = await createRegisterUser(deps)({
      ...VALID,
      country: 'ch',
      phone: '+41 79 123 45 67',
    });

    expect(result.ok).toBe(true);
    const [stored] = [...profiles.store.values()];
    expect(stored?.country).toBe('CH');
    expect(stored?.phone).toBe('+41791234567');
  });

  it('writes no profile row when neither was given', async () => {
    const { deps, profiles } = makeDeps();

    const result = await createRegisterUser(deps)(VALID);

    expect(result.ok).toBe(true);
    // Most accounts set neither. A table of empty rows is one every read has to
    // outer-join around for nothing.
    expect(profiles.store.size).toBe(0);
  });

  it('refuses a number with no dialling code, and registers nobody', async () => {
    const { deps, users, profiles } = makeDeps();

    const result = await createRegisterUser(deps)({ ...VALID, phone: '079 123 45 67' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PhoneInvalid');
    // Checked before the account is created, so the person sees the error on the
    // form they are still looking at rather than signing up and losing the value.
    expect(users.store.size).toBe(0);
    expect(profiles.store.size).toBe(0);
  });

  it('refuses a country code that is not two letters', async () => {
    const { deps, users } = makeDeps();

    const result = await createRegisterUser(deps)({ ...VALID, country: 'Switzerland' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CountryInvalid');
    expect(users.store.size).toBe(0);
  });
});
