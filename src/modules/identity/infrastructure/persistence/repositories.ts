import 'server-only';

import { and, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import { EmailAddress } from '../../domain/email-address';
import { PasswordHash } from '../../domain/password';
import { Profile } from '../../domain/profile';
import { Session, type SessionId } from '../../domain/session';
import { User, type UserStatus } from '../../domain/user';
import {
  VerificationToken,
  type VerificationPurpose,
} from '../../domain/verification-token';
import type {
  ProfileRepository,
  SessionRepository,
  UserRepository,
  VerificationTokenRepository,
} from '../../application/ports';
import { profiles, sessions, users, verificationTokens } from './schema';

/** Raised when another writer changed the row first. */
export class ConcurrencyError extends Error {
  readonly _tag = 'ConcurrencyError';
  constructor(aggregate: string, id: string) {
    super(`${aggregate} ${id} was modified concurrently`);
    this.name = 'ConcurrencyError';
  }
}

type UserRow = typeof users.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

function userToDomain(row: UserRow): User {
  return User.rehydrate({
    id: row.id as UserId,
    email: EmailAddress.parseOrThrow(row.email),
    passwordHash: PasswordHash.fromEncoded(row.passwordHash),
    status: row.status,
    role: row.role,
    emailVerifiedAt: row.emailVerifiedAt,
    failedAttempts: row.failedAttempts,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
    version: row.version,
  });
}

function sessionToDomain(row: SessionRow): Session {
  return Session.rehydrate({
    id: row.id as SessionId,
    userId: row.userId as UserId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    authenticatedAt: row.authenticatedAt,
    revokedAt: row.revokedAt,
    userAgentHash: row.userAgentHash,
    ipHash: row.ipHash,
  });
}

/**
 * Another account already holds the handle.
 *
 * Its own error because the caller's response differs: a concurrency failure is
 * retried, this is shown to the person typing. Raised from the unique index rather
 * than from a prior read — two people claiming the same handle at the same moment
 * both pass any check made beforehand, and only the index can arbitrate.
 */
export class HandleTakenError extends Error {
  readonly _tag = 'HandleTakenError';

  constructor(readonly handle: string) {
    super(`Handle already taken: ${handle}`);
    this.name = 'HandleTakenError';
  }
}

export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private readonly db: Database) {}

  async find(userId: UserId): Promise<Profile | null> {
    const rows = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : profileToDomain(row);
  }

  async findMany(ids: readonly UserId[]): Promise<Map<UserId, Profile>> {
    if (ids.length === 0) return new Map();

    const rows = await this.db
      .select()
      .from(profiles)
      .where(inArray(profiles.userId, [...ids]));

    return new Map(rows.map((row) => [row.userId as UserId, profileToDomain(row)]));
  }

  async save(profile: Profile): Promise<void> {
    const snapshot = profile.snapshot();

    try {
      // Upsert, because the row is created on demand: most accounts never set
      // either field, and a table of empty rows is one every read outer-joins
      // around for nothing. The `where` on the update is the optimistic guard —
      // a stale version matches no row and the insert path cannot have run.
      const updated = await this.db
        .insert(profiles)
        .values({
          userId: snapshot.userId,
          displayName: snapshot.displayName,
          handle: snapshot.handle,
          updatedAt: snapshot.updatedAt,
          version: snapshot.version + 1,
        })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            displayName: snapshot.displayName,
            handle: snapshot.handle,
            updatedAt: snapshot.updatedAt,
            version: snapshot.version + 1,
          },
          where: eq(profiles.version, snapshot.version),
        })
        .returning({ userId: profiles.userId });

      if (updated.length === 0) throw new ConcurrencyError('Profile', snapshot.userId);
    } catch (error) {
      // Postgres 23505 is a unique violation. The only unique index on this table
      // is the handle, so there is nothing else this can mean.
      if (snapshot.handle !== null && isUniqueViolation(error)) {
        throw new HandleTakenError(snapshot.handle);
      }
      throw error;
    }
  }
}

/** Postgres `unique_violation`, however the driver chose to wrap it. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;

  // The Neon HTTP driver nests the original under `cause` on some paths, and
  // reports others only in the message. Checked in that order so a genuine crash
  // is not mistaken for a taken handle by a coincidental substring.
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && cause !== error && isUniqueViolation(cause)) return true;

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('profiles_handle_uq');
}

function profileToDomain(row: typeof profiles.$inferSelect): Profile {
  return Profile.rehydrate({
    userId: row.userId as UserId,
    displayName: row.displayName,
    handle: row.handle,
    updatedAt: row.updatedAt,
    version: row.version,
  });
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  nextId(): UserId {
    // UUID v4 from the platform CSPRNG. Time-ordered v7 would index better; that is
    // a deliberate follow-up, not an oversight.
    return crypto.randomUUID() as UserId;
  }

  async findById(id: UserId): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : userToDomain(row);
  }

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.value))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : userToDomain(row);
  }

  async findManyByIds(ids: readonly UserId[]): Promise<User[]> {
    if (ids.length === 0) return [];

    const rows = await this.db
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]));

    return rows.map(userToDomain);
  }

  /**
   * Inserts only if the address is free, letting the unique index arbitrate.
   *
   * `onConflictDoNothing` + `returning` means a lost race returns zero rows rather
   * than throwing, so the caller gets a clean boolean instead of having to
   * pattern-match a driver error string.
   */
  async insertIfEmailFree(user: User): Promise<boolean> {
    const snapshot = user.snapshot();
    const inserted = await this.db
      .insert(users)
      .values({
        id: snapshot.id,
        email: snapshot.email.value,
        passwordHash: snapshot.passwordHash.encoded,
        status: snapshot.status,
        role: snapshot.role,
        emailVerifiedAt: snapshot.emailVerifiedAt,
        failedAttempts: snapshot.failedAttempts,
        lockedUntil: snapshot.lockedUntil,
        createdAt: snapshot.createdAt,
        version: 1,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    return inserted.length > 0;
  }

  async search(query: {
    term?: string | undefined;
    status?: UserStatus | undefined;
    limit: number;
    offset: number;
  }): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(userFilter(query))
      .orderBy(desc(users.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return rows.map(userToDomain);
  }

  async countMatching(query: {
    term?: string | undefined;
    status?: UserStatus | undefined;
  }): Promise<number> {
    const rows = await this.db.select({ total: count() }).from(users).where(userFilter(query));
    return rows[0]?.total ?? 0;
  }

  async tallyByStatus(): Promise<{ status: UserStatus; total: number }[]> {
    const rows = await this.db
      .select({ status: users.status, total: count() })
      .from(users)
      .groupBy(users.status);

    return rows.map((row) => ({ status: row.status, total: row.total }));
  }

  async save(user: User): Promise<void> {
    const snapshot = user.snapshot();

    const updated = await this.db
      .update(users)
      .set({
        email: snapshot.email.value,
        passwordHash: snapshot.passwordHash.encoded,
        status: snapshot.status,
        role: snapshot.role,
        emailVerifiedAt: snapshot.emailVerifiedAt,
        failedAttempts: snapshot.failedAttempts,
        lockedUntil: snapshot.lockedUntil,
        version: snapshot.version + 1,
      })
      .where(and(eq(users.id, snapshot.id), eq(users.version, snapshot.version)))
      .returning({ id: users.id });

    // Zero rows means another writer won the race on this version.
    if (updated.length === 0) throw new ConcurrencyError('User', snapshot.id);
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  nextId(): SessionId {
    return crypto.randomUUID() as SessionId;
  }

  async findById(id: SessionId): Promise<Session | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : sessionToDomain(row);
  }

  async save(session: Session): Promise<void> {
    const snapshot = session.snapshot();
    await this.db
      .insert(sessions)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        createdAt: snapshot.createdAt,
        lastSeenAt: snapshot.lastSeenAt,
        expiresAt: snapshot.expiresAt,
        authenticatedAt: snapshot.authenticatedAt,
        revokedAt: snapshot.revokedAt,
        userAgentHash: snapshot.userAgentHash,
        ipHash: snapshot.ipHash,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          lastSeenAt: sql`excluded.last_seen_at`,
          authenticatedAt: sql`excluded.authenticated_at`,
          revokedAt: sql`excluded.revoked_at`,
        },
      });
  }

  async revokeAllForUser(userId: UserId, now: Date): Promise<number> {
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length;
  }

  async listActiveForUser(userId: UserId, now: Date): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt))
      .limit(50);

    return rows.map(sessionToDomain);
  }

  /** Bounded delete on the expiry index — never a full-table sweep. */
  async lastSeenFor(userIds: readonly UserId[], now: Date): Promise<Map<UserId, Date>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.db
      .select({ userId: sessions.userId, lastSeenAt: sql<string>`max(${sessions.lastSeenAt})` })
      .from(sessions)
      .where(
        and(
          inArray(sessions.userId, [...userIds]),
          // Live sessions only. A revoked or expired one says when somebody *was*
          // here, which on a column headed "last active" reads as somebody who is
          // still signed in.
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .groupBy(sessions.userId);

    return new Map(rows.map((row) => [row.userId as UserId, new Date(row.lastSeenAt)]));
  }

  async deleteExpired(now: Date, limit: number): Promise<number> {
    const deleted = await this.db
      .delete(sessions)
      .where(
        sql`${sessions.id} IN (
          SELECT ${sessions.id} FROM ${sessions}
          WHERE ${lt(sessions.expiresAt, now)}
          LIMIT ${limit}
        )`,
      )
      .returning({ id: sessions.id });
    return deleted.length;
  }
}

export class DrizzleVerificationTokenRepository implements VerificationTokenRepository {
  constructor(private readonly db: Database) {}

  nextId(): string {
    return crypto.randomUUID();
  }

  async save(token: VerificationToken): Promise<void> {
    const snapshot = token.snapshot();
    await this.db
      .insert(verificationTokens)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        purpose: snapshot.purpose,
        tokenHash: snapshot.tokenHash,
        createdAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt,
        consumedAt: snapshot.consumedAt,
      })
      .onConflictDoUpdate({
        target: verificationTokens.id,
        // Only consumption changes after issue; the digest and expiry are fixed.
        set: { consumedAt: sql`excluded.consumed_at` },
      });
  }

  async findByHash(tokenHash: string): Promise<VerificationToken | null> {
    const rows = await this.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    return VerificationToken.rehydrate({
      id: row.id,
      userId: row.userId as UserId,
      purpose: row.purpose,
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    });
  }

  /**
   * Marks a user's outstanding tokens for one purpose as spent.
   *
   * Consumed rather than deleted so that a later attempt to use a superseded link
   * is distinguishable from one that never existed, in the audit trail if not in
   * the response.
   */
  async consumeOutstanding(
    userId: UserId,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<number> {
    const updated = await this.db
      .update(verificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.purpose, purpose),
          isNull(verificationTokens.consumedAt),
        ),
      )
      .returning({ id: verificationTokens.id });

    return updated.length;
  }

  /** Bounded delete on the expiry index — never a full-table sweep. */
  async deleteExpired(now: Date, limit: number): Promise<number> {
    const deleted = await this.db
      .delete(verificationTokens)
      .where(
        sql`${verificationTokens.id} IN (
          SELECT ${verificationTokens.id} FROM ${verificationTokens}
          WHERE ${lt(verificationTokens.expiresAt, now)}
          LIMIT ${limit}
        )`,
      )
      .returning({ id: verificationTokens.id });

    return deleted.length;
  }
}

/**
 * The console's account filter.
 *
 * `ilike` on the email, and an exact match on the id. Not `ilike` on the id: it is
 * a UUID, so a substring match would scan every row to find something an operator
 * only ever pastes whole.
 *
 * The email pattern escapes `%` and `_` before interpolation. Without it a search
 * for "a_b" matches "axb", which is a confusing result rather than a dangerous one
 * — but the same habit applied to a column that mattered would not be.
 */
function userFilter(query: { term?: string | undefined; status?: UserStatus | undefined }) {
  const clauses = [];

  const term = query.term?.trim();
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    clauses.push(or(ilike(users.email, pattern), eq(users.id, term)));
  }
  if (query.status) clauses.push(eq(users.status, query.status));

  return clauses.length === 0 ? undefined : and(...clauses);
}
