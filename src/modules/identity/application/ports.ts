import type { UserId } from '@/shared/kernel/ids';

import type { EmailAddress } from '../domain/email-address';
import type { PasswordHash } from '../domain/password';
import type { Session, SessionId } from '../domain/session';
import type { User } from '../domain/user';
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
  /** @throws ConcurrencyError when the stored version has moved on. */
  save(user: User): Promise<void>;
  /** Relies on a unique index, so two concurrent registrations cannot both win. */
  insertIfEmailFree(user: User): Promise<boolean>;
}

export interface SessionRepository {
  nextId(): SessionId;
  findById(id: SessionId): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Revokes every session for a user — "log out all devices". */
  revokeAllForUser(userId: UserId, now: Date): Promise<number>;
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
