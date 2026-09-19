/**
 * User — the aggregate root of the Identity context.
 *
 * Scope discipline: to Identity a user is *credentials and access state*. Their
 * verification tier belongs to Compliance, their balances to Ledger, their orders to
 * Trading. Letting those fields creep in here is how a 40-field god object forms
 * that every team edits and nobody understands.
 *
 * Pure domain. No framework, no I/O.
 */

import { err, ok, type Result } from '@/shared/kernel/result';
import type { UserId } from '@/shared/kernel/ids';

import type { AccountNumber } from './account-number';
import type { EmailAddress } from './email-address';
import type { PasswordHash } from './password';

export type UserStatus = 'active' | 'locked' | 'disabled';

/**
 * What a user is allowed to reach.
 *
 * Two values, deliberately, rather than a permission matrix. This context knows
 * "customer" from "operator" and nothing finer; which *operations* an operator
 * may perform is a question for the operations context that owns them, and
 * modelling it here would drag those rules into identity.
 *
 * The default is `customer`. A role is granted deliberately — there is no code
 * path that promotes anyone, because promotion is an administrative act with an
 * audit trail, not something a registration form does.
 */
export type UserRole = 'customer' | 'admin';

/**
 * Lockout thresholds.
 *
 * Bounded and time-based rather than permanent: a permanent lock on failed attempts
 * turns a guessing attempt against someone else's account into a denial of service
 * against that person.
 */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export type AuthenticationFailure =
  | { _tag: 'AccountLocked'; until: Date }
  | { _tag: 'AccountDisabled' };

export interface UserProps {
  id: UserId;
  email: EmailAddress;
  /**
   * The ten digits the account holder sees, and an operator types to find them.
   *
   * Assigned once, at registration, and never reissued: it is printed on a
   * dashboard and read out loud, and an identifier that changes is one that sends
   * somebody to the wrong account. See `AccountNumber` for why it is drawn at
   * random rather than counted, and why it identifies without authenticating.
   */
  accountNumber: AccountNumber;
  /**
   * Null for an account that has only ever signed in through a provider.
   *
   * Not a placeholder hash of something unguessable, which is the usual shortcut:
   * that account would report itself as having a password, "forgot password" would
   * hand it one, and this context would have no way to tell the two kinds of
   * account apart — which is exactly what the security page has to show.
   */
  passwordHash: PasswordHash | null;
  status: UserStatus;
  role: UserRole;
  emailVerifiedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  version: number;
}

export class User {
  private constructor(private props: UserProps) {}

  /** Registration. The only way a new User comes into existence. */
  static register(input: {
    id: UserId;
    email: EmailAddress;
    accountNumber: AccountNumber;
    passwordHash: PasswordHash;
    now: Date;
  }): User {
    return new User({
      id: input.id,
      email: input.email,
      accountNumber: input.accountNumber,
      passwordHash: input.passwordHash,
      status: 'active',
      // Never `admin`. Registration cannot grant privilege.
      role: 'customer',
      emailVerifiedAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: input.now,
      version: 0,
    });
  }

  /**
   * Registration through an identity provider, with no password.
   *
   * The address arrives already confirmed, because the provider confirmed it — that
   * is the whole claim a "sign in with Google" carries, and the caller must refuse
   * a profile whose address the provider has *not* verified before reaching here.
   * Sending our own confirmation mail afterwards would ask somebody to prove
   * something they have just proved.
   */
  static registerWithProvider(input: {
    id: UserId;
    email: EmailAddress;
    accountNumber: AccountNumber;
    now: Date;
  }): User {
    return new User({
      id: input.id,
      email: input.email,
      accountNumber: input.accountNumber,
      passwordHash: null,
      status: 'active',
      role: 'customer',
      emailVerifiedAt: input.now,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: input.now,
      version: 0,
    });
  }

  /**
   * Reconstruction from storage.
   *
   * Separate from `register` on purpose: a row written under last month's rules must
   * still load today. Re-running registration validation on read turns a policy
   * change into a data outage.
   */
  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  get id(): UserId {
    return this.props.id;
  }
  get email(): EmailAddress {
    return this.props.email;
  }
  get accountNumber(): AccountNumber {
    return this.props.accountNumber;
  }
  get passwordHash(): PasswordHash | null {
    return this.props.passwordHash;
  }

  /** Whether this account can be signed into with a password at all. */
  get hasPassword(): boolean {
    return this.props.passwordHash !== null;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get role(): UserRole {
    return this.props.role;
  }

  get isAdmin(): boolean {
    return this.props.role === 'admin';
  }
  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt;
  }
  get failedAttempts(): number {
    return this.props.failedAttempts;
  }
  get lockedUntil(): Date | null {
    return this.props.lockedUntil;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get version(): number {
    return this.props.version;
  }

  get isEmailVerified(): boolean {
    return this.props.emailVerifiedAt !== null;
  }

  isLockedAt(now: Date): boolean {
    return this.props.lockedUntil !== null && this.props.lockedUntil > now;
  }

  /**
   * Whether this account may attempt authentication at all.
   *
   * Called BEFORE verifying the password, so a locked account never consumes the
   * (deliberately expensive) hash comparison.
   */
  canAttemptAuthentication(now: Date): Result<void, AuthenticationFailure> {
    if (this.props.status === 'disabled') {
      return err({ _tag: 'AccountDisabled' });
    }
    if (this.isLockedAt(now)) {
      return err({ _tag: 'AccountLocked', until: this.props.lockedUntil! });
    }
    return ok(undefined);
  }

  /** Records a failed attempt, locking the account once the threshold is crossed. */
  recordFailedAttempt(now: Date): void {
    const attempts = this.props.failedAttempts + 1;
    this.props = {
      ...this.props,
      failedAttempts: attempts,
      lockedUntil:
        attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null,
      status: this.props.status === 'active' && attempts >= MAX_FAILED_ATTEMPTS
        ? 'locked'
        : this.props.status,
    };
  }

  /** Clears the failure counter after a successful authentication. */
  recordSuccessfulAuthentication(): void {
    this.props = {
      ...this.props,
      failedAttempts: 0,
      lockedUntil: null,
      status: this.props.status === 'locked' ? 'active' : this.props.status,
    };
  }

  /**
   * Replaces the stored credential.
   *
   * Used both for a genuine password change and for transparent re-hashing when the
   * cost parameters have been raised since the hash was created.
   */
  replacePasswordHash(passwordHash: PasswordHash): void {
    this.props = { ...this.props, passwordHash };
  }

  verifyEmail(now: Date): void {
    if (this.props.emailVerifiedAt !== null) return; // idempotent
    this.props = { ...this.props, emailVerifiedAt: now };
  }

  /**
   * Withdraws access, by decision rather than by failed attempts.
   *
   * `disabled`, not `locked`. The two are different states on purpose: `locked` is
   * what the failure counter produces and what a successful sign-in clears by
   * itself, so suspending into it would mean the suspension lifts the moment the
   * lockout window passes. `disabled` is refused at
   * `canAttemptAuthentication` and by `resolveSession`, and nothing clears it
   * except somebody deciding to.
   */
  suspend(): void {
    this.props = { ...this.props, status: 'disabled' };
  }

  /**
   * Restores access.
   *
   * Clears the failure counter too. Somebody suspended after a run of bad
   * passwords would otherwise come back still one attempt from being locked out
   * again, by a counter nobody can see.
   */
  reinstate(): void {
    this.props = { ...this.props, status: 'active', failedAttempts: 0, lockedUntil: null };
  }

  /** Snapshot for the persistence mapper. Infrastructure use only. */
  snapshot(): Readonly<UserProps> {
    return { ...this.props };
  }
}
