import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { EmailAddress } from '../../domain/email-address';
import { PasswordHash } from '../../domain/password';
import { User, type UserRole, type UserStatus } from '../../domain/user';
import type { IdentityDependencies } from '../ports';
import { createSetAdminStatus } from '../use-cases/set-admin-status';

/**
 * Suspending an operator.
 *
 * The interesting part is not that the status changes — it is the three things the
 * use case refuses, each of which locks somebody out of a console they would need
 * in order to undo it.
 */

const NOW = new Date('2026-09-14T10:00:00.000Z');
const ACTOR = 'admin-1' as UserId;
const OTHER = 'admin-2' as UserId;
const CUSTOMER = 'customer-1' as UserId;

function account(id: UserId, role: UserRole, status: UserStatus): User {
  return User.rehydrate({
    id,
    email: EmailAddress.parseOrThrow(`${id}@novex.io`),
    passwordHash: PasswordHash.fromEncoded('scrypt$1$16384$8$1$c2FsdA$a2V5'),
    status,
    role,
    emailVerifiedAt: NOW,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: NOW,
    version: 0,
  });
}

function build(users: User[]) {
  const store = new Map(users.map((user) => [user.id, user]));
  const revoked: UserId[] = [];

  const deps = {
    clock: fixedClock(NOW),
    users: {
      async findById(id: UserId) {
        return store.get(id) ?? null;
      },
      async save(user: User) {
        store.set(user.id, user);
      },
      async countMatching(query: { role?: UserRole; status?: UserStatus }) {
        return [...store.values()].filter(
          (user) =>
            (query.role === undefined || user.role === query.role) &&
            (query.status === undefined || user.status === query.status),
        ).length;
      },
    },
    sessions: {
      async revokeAllForUser(id: UserId) {
        revoked.push(id);
        return 1;
      },
    },
    profiles: {
      async find() {
        return null;
      },
    },
  } as unknown as IdentityDependencies;

  return { store, revoked, run: createSetAdminStatus(deps) };
}

describe('setAdminStatus', () => {
  it('suspends another operator and revokes their sessions in the same breath', async () => {
    const harness = build([
      account(ACTOR, 'admin', 'active'),
      account(OTHER, 'admin', 'active'),
    ]);

    const result = await harness.run({ actorId: ACTOR, targetId: OTHER, action: 'suspend' });

    expect(result.ok).toBe(true);
    expect(harness.store.get(OTHER)?.status).toBe('disabled');
    // The page promises the session goes immediately. `disabled` alone would only
    // bite on their next request, which on an idle tab could be an hour.
    expect(harness.revoked).toEqual([OTHER]);
  });

  it('refuses to suspend the last active administrator', async () => {
    // Two administrators, but only one who can still sign in. Suspending that one
    // leaves nobody able to reach the console — and only the CLI can undo it.
    const harness = build([
      account(ACTOR, 'admin', 'active'),
      account(OTHER, 'admin', 'disabled'),
    ]);

    // A second active operator is needed to even attempt this, since nobody may
    // act on themselves — so the count, not the actor, is what refuses it.
    const result = await harness.run({ actorId: OTHER, targetId: ACTOR, action: 'suspend' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('LastAdministrator');
    expect(harness.store.get(ACTOR)?.status).toBe('active');
    expect(harness.revoked).toEqual([]);
  });

  it('refuses to act on yourself', async () => {
    const harness = build([
      account(ACTOR, 'admin', 'active'),
      account(OTHER, 'admin', 'active'),
    ]);

    // Suspending your own account signs you out of the screen you would need to
    // undo it. Checked before anything is read, so it holds even if the roster is
    // unavailable.
    const result = await harness.run({ actorId: ACTOR, targetId: ACTOR, action: 'suspend' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CannotSuspendSelf');
    expect(harness.store.get(ACTOR)?.status).toBe('active');
  });

  it('refuses to touch a customer, without confirming they exist', async () => {
    // This screen manages the console team. Pointing it at a customer would make
    // it a general account-freezing tool by accident.
    const harness = build([
      account(ACTOR, 'admin', 'active'),
      account(OTHER, 'admin', 'active'),
      account(CUSTOMER, 'customer', 'active'),
    ]);

    const result = await harness.run({
      actorId: ACTOR,
      targetId: CUSTOMER,
      action: 'suspend',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The same answer a missing id gives.
    expect(result.error._tag).toBe('AdministratorNotFound');
    expect(harness.store.get(CUSTOMER)?.status).toBe('active');
  });

  it('reinstates without needing a spare administrator, and clears the lockout', async () => {
    const locked = account(OTHER, 'admin', 'locked');
    // A run of bad passwords before the suspension. Coming back one attempt from
    // being locked out again, by a counter nobody can see, is not "restored".
    locked.recordFailedAttempt(NOW);
    const harness = build([account(ACTOR, 'admin', 'active'), locked]);

    const result = await harness.run({ actorId: ACTOR, targetId: OTHER, action: 'reinstate' });

    expect(result.ok).toBe(true);
    const restored = harness.store.get(OTHER);
    expect(restored?.status).toBe('active');
    expect(restored?.snapshot().failedAttempts).toBe(0);
    expect(restored?.snapshot().lockedUntil).toBeNull();
    // Nothing to revoke: they had no way in to begin with.
    expect(harness.revoked).toEqual([]);
  });
});
