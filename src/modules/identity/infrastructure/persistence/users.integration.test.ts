import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';

import { EmailAddress } from '../../domain/email-address';
import { User } from '../../domain/user';
import { DrizzleUserRepository } from './repositories';
import { users } from './schema';

/**
 * The user repository against a real database.
 *
 * ── Why this one is not a unit test ───────────────────────────────────────────
 * The bug it exists for lived *between* two SQL statements: the insert wrote
 * `version: 1` while a freshly registered aggregate carried 0, so the next `save`
 * of that same object updated nothing, read that as a lost race, and threw
 * `ConcurrencyError`. Every fake repository in the unit suite agreed with itself
 * and saw nothing. Only the real statements disagree.
 *
 * Signing in with Google for the first time is the path that hit it: insert the
 * account, then save it to confirm the address Google vouched for. The callback
 * answered 500 with the account already created.
 *
 * Skipped without a database, which is why it is in the `integration` project and
 * out of `pnpm test`.
 */

const url = process.env.DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('DrizzleUserRepository', () => {
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  const repository = new DrizzleUserRepository(db as never);
  const created: string[] = [];

  const account = () => {
    const address = EmailAddress.parse(
      `version-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
    );
    if (!address.ok) throw new Error('the probe address should parse');

    return User.registerWithProvider({
      id: repository.nextId(),
      email: address.value,
      externalId: "",
      accountNumber: repository.nextAccountNumber(),
      now: new Date(),
    });
  };

  beforeAll(async () => {
    await pool.query('select 1');
  });

  afterAll(async () => {
    for (const id of created) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('stores a new account at the version the aggregate is holding', async () => {
    const user = account();
    created.push(user.id);

    expect(await repository.insertIfEmailFree(user)).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.version).toBe(user.snapshot().version);
  });

  /* The regression: the same object, saved straight after being inserted. */
  it('saves an account it has just inserted, rather than reporting a conflict', async () => {
    const user = account();
    created.push(user.id);
    await repository.insertIfEmailFree(user);

    user.recordSuccessfulAuthentication();
    user.verifyEmail(new Date());

    await expect(repository.save(user)).resolves.toBeUndefined();

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).not.toBeNull();
    // One write on top of the insert, and the row says so.
    expect(row?.version).toBe(user.snapshot().version + 1);
  });

  /* And the check still does its job: a stale object must not overwrite a newer row. */
  it('still refuses a write from an object whose row has moved on', async () => {
    const user = account();
    created.push(user.id);
    await repository.insertIfEmailFree(user);

    const stale = User.rehydrate(user.snapshot());
    user.verifyEmail(new Date());
    await repository.save(user);

    stale.recordSuccessfulAuthentication();
    await expect(repository.save(stale)).rejects.toThrow(/modified concurrently/);
  });
});
