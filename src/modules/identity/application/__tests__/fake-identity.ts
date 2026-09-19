import { AccountNumber } from '../../domain/account-number';
import type { EmailAddress } from '../../domain/email-address';
import { PasswordHash } from '../../domain/password';
import type { Profile } from '../../domain/profile';
import type { Session, SessionId } from '../../domain/session';
import type { User, UserStatus } from '../../domain/user';
import type { VerificationToken, VerificationPurpose } from '../../domain/verification-token';
import type { UserId } from '@/shared/kernel/ids';
import type {
  AppUrls,
  EmailSender,
  OutboundEmail,
  PasswordHasher,
  ProfileRepository,
  SessionRepository,
  SessionSealer,
  UserRepository,
  VerificationTokenHasher,
  VerificationTokenRepository,
} from '../ports';

/**
 * In-memory adapters for the credential flows.
 *
 * Shared rather than redeclared per test, for the reason `fake-verifications.ts`
 * gives: a rule that changes — how a session is revoked, what a lost insert race
 * returns — changes here and every test that depends on it moves together.
 *
 * Each fake enforces the rules its real adapter enforces. `insertIfEmailFree`
 * refuses a taken address and `revokeOthersForUser` spares the session it is given,
 * because a fake that says yes to everything lets a test pass against behaviour the
 * database would refuse.
 */

/** Reversible stand-in for scrypt: fast, and lets tests assert on the result. */
export class FakeHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<PasswordHash> {
    return PasswordHash.fromEncoded(`fake$${plaintext}`);
  }
  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    return hash.encoded === `fake$${plaintext}`;
  }
  needsRehash(): boolean {
    return false;
  }
}

export class FakeTokenHasher implements VerificationTokenHasher {
  private counter = 0;
  generate() {
    const token = `token-${this.counter++}`;
    return { token, tokenHash: this.hash(token) };
  }
  hash(token: string): string {
    return `sha:${token}`;
  }
}

export class FakeUsers implements UserRepository {
  readonly store = new Map<string, User>();
  private counter = 0;
  private accountNumberCounter = 0;

  /** `fixedId` pins every new id, for a test that wants to name its one account. */
  constructor(private readonly options: { fixedId?: UserId } = {}) {}

  nextId(): UserId {
    if (this.options.fixedId !== undefined) return this.options.fixedId;
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}` as UserId;
  }
  /**
   * Counted, not random, so a test can predict what it will get.
   *
   * The real adapter draws from the CSPRNG, and the property that matters to
   * `allocateAccountNumber` — that a taken number is refused and another tried —
   * is exercised better by a source that repeats deterministically than by one
   * that almost never collides.
   */
  nextAccountNumber(): AccountNumber {
    this.accountNumberCounter += 1;
    return AccountNumber.parseOrThrow(String(1_000_000_000 + this.accountNumberCounter));
  }
  async findById(id: UserId) {
    return this.store.get(id) ?? null;
  }
  async findByEmail(email: EmailAddress) {
    return [...this.store.values()].find((user) => user.email.equals(email)) ?? null;
  }
  async findByAccountNumber(accountNumber: AccountNumber) {
    return (
      [...this.store.values()].find((user) => user.accountNumber.equals(accountNumber)) ?? null
    );
  }
  async findManyByIds(ids: readonly UserId[]) {
    // Absent ids are simply missing from the result, as the port specifies — a
    // deleted account is an ordinary outcome for a caller holding a stale list.
    return ids.map((id) => this.store.get(id)).filter((user): user is User => user !== undefined);
  }
  private matching(query: { term?: string | undefined; status?: string | undefined }) {
    const term = query.term?.trim().toLowerCase();
    return [...this.store.values()].filter(
      (user) =>
        (!term ||
          user.email.value.toLowerCase().includes(term) ||
          user.id === query.term ||
          user.accountNumber.value === term) &&
        (!query.status || user.status === query.status),
    );
  }
  async search(query: {
    term?: string | undefined;
    status?: UserStatus | undefined;
    limit: number;
    offset: number;
  }) {
    return this.matching(query)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(query.offset, query.offset + query.limit);
  }
  async countMatching(query: { term?: string | undefined; status?: UserStatus | undefined }) {
    return this.matching(query).length;
  }
  async tallyByStatus() {
    const counts = new Map<UserStatus, number>();
    for (const user of this.store.values()) {
      counts.set(user.status, (counts.get(user.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, total]) => ({ status, total }));
  }
  async save(user: User) {
    this.store.set(user.id, user);
  }
  async insertIfEmailFree(user: User) {
    if (await this.findByEmail(user.email)) return false;
    this.store.set(user.id, user);
    return true;
  }
}

export class FakeSessions implements SessionRepository {
  readonly store = new Map<string, Session>();
  revokedCalls = 0;
  private counter = 0;
  nextId(): SessionId {
    return `session-${this.counter++}` as SessionId;
  }
  async findById(id: SessionId) {
    return this.store.get(id) ?? null;
  }
  async save(session: Session) {
    this.store.set(session.id, session);
  }
  async revokeAllForUser(userId: UserId, now: Date) {
    this.revokedCalls += 1;
    let count = 0;
    for (const session of this.store.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revoke(now);
        count += 1;
      }
    }
    return count;
  }
  async revokeOthersForUser(userId: UserId, keep: SessionId, now: Date) {
    let count = 0;
    for (const session of this.store.values()) {
      if (session.userId === userId && session.id !== keep && session.revokedAt === null) {
        session.revoke(now);
        count += 1;
      }
    }
    return count;
  }
  async listActiveForUser(userId: UserId, now: Date) {
    return [...this.store.values()].filter(
      (session) =>
        session.userId === userId && session.revokedAt === null && session.expiresAt > now,
    );
  }
  async lastSeenFor(userIds: readonly UserId[]) {
    return new Map(
      userIds.flatMap((id) => {
        const seen = [...this.store.values()]
          .filter((session) => session.userId === id && session.revokedAt === null)
          .map((session) => session.lastSeenAt)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        return seen ? ([[id, seen]] as [UserId, Date][]) : [];
      }),
    );
  }
  async deleteExpired() {
    return 0;
  }
}

export class FakeTokens implements VerificationTokenRepository {
  readonly store = new Map<string, VerificationToken>();
  private counter = 0;
  nextId(): string {
    return `record-${this.counter++}`;
  }
  async save(token: VerificationToken) {
    this.store.set(token.tokenHash, token);
  }
  async findByHash(tokenHash: string) {
    return this.store.get(tokenHash) ?? null;
  }
  async consumeOutstanding(userId: UserId, purpose: VerificationPurpose, now: Date) {
    let count = 0;
    for (const token of this.store.values()) {
      if (token.userId === userId && token.purpose === purpose && token.consumedAt === null) {
        token.consume(now);
        count += 1;
      }
    }
    return count;
  }
  async deleteExpired() {
    return 0;
  }
}

export class RecordingEmailSender implements EmailSender {
  readonly sent: OutboundEmail[] = [];
  async send(message: OutboundEmail) {
    this.sent.push(message);
  }
}

/** Nobody in these tests sets a name; the port still has to be satisfiable. */
export class FakeProfiles implements ProfileRepository {
  readonly store = new Map<UserId, Profile>();

  async find(userId: UserId) {
    return this.store.get(userId) ?? null;
  }
  async findMany(ids: readonly UserId[]) {
    return new Map(
      ids.flatMap((id) => {
        const profile = this.store.get(id);
        return profile ? ([[id, profile]] as [UserId, Profile][]) : [];
      }),
    );
  }
  async save(profile: Profile) {
    this.store.set(profile.userId, profile);
  }
}

export const fakeUrls: AppUrls = {
  verifyEmail: (token) => `https://novex.test/verify-email?token=${token}`,
  resetPassword: (token) => `https://novex.test/reset-password?token=${token}`,
};

export const fakeSealer: SessionSealer = {
  async seal(id) {
    return `sealed:${id}`;
  },
  async unseal(sealed) {
    return sealed.startsWith('sealed:') ? ((sealed.slice(7) as SessionId) ?? null) : null;
  },
};
