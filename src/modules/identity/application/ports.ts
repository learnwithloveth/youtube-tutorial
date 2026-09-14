import type { UserId } from '@/shared/kernel/ids';

import type { EmailAddress } from '../domain/email-address';
import type { PasswordHash } from '../domain/password';
import type { Session, SessionId } from '../domain/session';
import type { Profile } from '../domain/profile';
import type { User, UserRole, UserStatus } from '../domain/user';
import type { VerificationPurpose, VerificationToken } from '../domain/verification-token';

/**
 * Ports for the identity module.
 *
 * These are the seam that makes the module extractable: to run identity as its own
 * service, keep `domain/` and `application/` and supply different adapters. Nothing
 * above this layer knows how a password is hashed, where a session is stored, or
 * which mail transport is configured.
 */

export interface UserRepository {
  nextId(): UserId;
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: EmailAddress): Promise<User | null>;
  /**
   * Bulk lookup for a caller that holds ids and needs names.
   *
   * Order is not guaranteed and missing ids are simply absent from the result: a
   * deleted account is an ordinary outcome for a console reading a list of ids
   * assembled a moment earlier, not an error.
   */
  findManyByIds(ids: readonly UserId[]): Promise<User[]>;
  /** @throws ConcurrencyError when the stored version has moved on. */
  save(user: User): Promise<void>;
  /** Relies on a unique index, so two concurrent registrations cannot both win. */
  insertIfEmailFree(user: User): Promise<boolean>;

  /**
   * The console's account list: filtered, paged, newest first.
   *
   * `term` matches an email or an id, never a display name. That is not because
   * the module cannot reach one — `ProfileRepository` is right below — but because
   * `User` deliberately does not carry it: an entity that accumulates every field
   * anyone wants to search on is how a forty-field user object forms. Searching by
   * name means joining profiles here, which is a change worth making on purpose.
   */
  search(query: {
    term?: string | undefined;
    status?: UserStatus | undefined;
    /** Narrows to one access tier. The console's team screen lists operators. */
    role?: UserRole | undefined;
    limit: number;
    offset: number;
  }): Promise<User[]>;

  /** Total matching `search`, for the pager. */
  countMatching(query: {
    term?: string | undefined;
    status?: UserStatus | undefined;
    role?: UserRole | undefined;
  }): Promise<number>;

  /** One row per status, for the header tiles. One query, not one per tile. */
  tallyByStatus(): Promise<{ status: UserStatus; total: number }[]>;
}

/**
 * Display names and handles.
 *
 * Separate from `UserRepository` because `User` is the credential and this is
 * presentation — see `domain/profile.ts`. Callers that need both ask both and zip
 * the results, which keeps the entity from growing fields no access decision uses.
 */
export interface ProfileRepository {
  find(userId: UserId): Promise<Profile | null>;

  /**
   * Bulk lookup, keyed by id.
   *
   * A map rather than an array, because every caller is joining it onto a list of
   * users it already has — and missing ids are ordinary: most accounts never set
   * a name, so most lookups come back partially empty by design.
   */
  findMany(ids: readonly UserId[]): Promise<Map<UserId, Profile>>;

  /**
   * Creates or updates the row.
   *
   * @throws ConcurrencyError when the stored version has moved on.
   * @throws HandleTakenError when another account already holds the handle. The
   *         unique index is what decides that, not a prior read — two people
   *         claiming the same handle at once both pass any check made beforehand.
   */
  save(profile: Profile): Promise<void>;
}

export interface SessionRepository {
  nextId(): SessionId;
  findById(id: SessionId): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Revokes every session for a user — "log out all devices". */
  revokeAllForUser(userId: UserId, now: Date): Promise<number>;
  /**
   * A user's live sessions, most recently seen first.
   *
   * Only the unrevoked and unexpired ones: a session list exists so somebody can
   * spot one they do not recognise, and padding it with dead rows buries the
   * signal it is there to surface.
   */
  listActiveForUser(userId: UserId, now: Date): Promise<Session[]>;

  /**
   * When each of these accounts was last seen, in one query.
   *
   * The alternative is `listActiveForUser` per row, which on a team screen is one
   * round trip per administrator to compute a column. Aggregated in the database
   * for the same reason the activity module aggregates its tallies.
   *
   * Absent means no live session — which is a real answer, not a missing one, and
   * the caller renders it as such rather than as a blank.
   */
  lastSeenFor(userIds: readonly UserId[], now: Date): Promise<Map<UserId, Date>>;
  deleteExpired(now: Date, limit: number): Promise<number>;
}

export interface VerificationTokenRepository {
  nextId(): string;
  save(token: VerificationToken): Promise<void>;
  /** Looked up by digest — the raw token is never stored, so never queried. */
  findByHash(tokenHash: string): Promise<VerificationToken | null>;
  /**
   * Invalidates a user's outstanding tokens for one purpose.
   *
   * Called when a new token is issued, so that requesting a second reset link
   * silently kills the first. Otherwise every link ever mailed stays live until
   * it expires, and the attack surface is the whole inbox history.
   */
  consumeOutstanding(userId: UserId, purpose: VerificationPurpose, now: Date): Promise<number>;
  deleteExpired(now: Date, limit: number): Promise<number>;
}

/**
 * Password hashing.
 *
 * A port rather than a domain service because it is intentionally slow (that is the
 * security property), which would make domain tests unusable, and because the
 * algorithm must be swappable without touching business rules.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<PasswordHash>;
  /** MUST be constant-time with respect to the secret. */
  verify(plaintext: string, hash: PasswordHash): Promise<boolean>;
  /** True when `hash` used weaker parameters than current policy. */
  needsRehash(hash: PasswordHash): boolean;
}

/**
 * Generates verification tokens and digests them for storage.
 *
 * Separate from `PasswordHasher` on purpose. That one is deliberately slow because
 * passwords are low-entropy; this one is fast because a 256-bit random token cannot
 * be guessed regardless, and making every verification link cost 100ms of scrypt
 * would be pure waste. Conflating the two is how one of those properties gets lost.
 */
export interface VerificationTokenHasher {
  /** Returns the raw token to mail, and the digest to store. */
  generate(): { token: string; tokenHash: string };
  /** Digests a presented token so it can be looked up. */
  hash(token: string): string;
}

/**
 * Seals a session id into an opaque cookie value and back.
 *
 * Authenticated encryption: tampering must fail closed, not silently decode to a
 * different session id.
 */
export interface SessionSealer {
  seal(sessionId: SessionId): Promise<string>;
  unseal(sealed: string): Promise<SessionId | null>;
}

/** One-way hashing for values we must correlate but must not store in the clear. */
export interface Digest {
  hash(value: string): string;
}

export interface OutboundEmail {
  to: EmailAddress;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends mail.
 *
 * The port takes a rendered message rather than a template name and variables, so
 * the application layer owns the wording and the adapter owns only the transport.
 * That keeps "what the email says" reviewable in the same place as the rule that
 * triggers it.
 */
export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

/**
 * Where the links in outbound mail point.
 *
 * Injected rather than read from the environment inside a use case, because a use
 * case that reads `process.env` cannot be tested without setting global state, and
 * because getting this wrong sends every user to the wrong host.
 */
export interface AppUrls {
  verifyEmail(token: string): string;
  resetPassword(token: string): string;
}

export interface IdentityDependencies {
  users: UserRepository;
  profiles: ProfileRepository;
  sessions: SessionRepository;
  tokens: VerificationTokenRepository;
  hasher: PasswordHasher;
  tokenHasher: VerificationTokenHasher;
  sealer: SessionSealer;
  digest: Digest;
  email: EmailSender;
  urls: AppUrls;
  clock: { now(): Date };
}
