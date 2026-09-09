/**
 * Session — a server-revocable authenticated session.
 *
 * Pure domain. No framework, no I/O.
 *
 * ── Why a session row and not a bare JWT ────────────────────────────────────────
 * A self-contained JWT cannot be revoked before it expires. For a product that moves
 * money that is disqualifying: "log out all devices" after a stolen laptop has to
 * take effect immediately, not in 24 hours. So the cookie carries an opaque sealed
 * id and the server holds the authority.
 */

import { err, ok, type Result } from '@/shared/kernel/result';
import type { UserId } from '@/shared/kernel/ids';

export type SessionId = string & { readonly __brand: 'SessionId' };

export type SessionFailure =
  | { _tag: 'SessionExpired' }
  | { _tag: 'SessionRevoked' }
  | { _tag: 'StepUpRequired' };

/** Absolute lifetime. A session cannot be extended past this without re-login. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Idle timeout: inactivity for this long ends the session. */
export const SESSION_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/**
 * How recently the user must have proven who they are for a high-risk action.
 *
 * A valid session is not sufficient authority to move funds: an unlocked, unattended
 * laptop would be. Withdrawals, API-key creation, and MFA changes require a fresh
 * proof — this is the "step-up" window.
 */
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

export interface SessionProps {
  id: SessionId;
  userId: UserId;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  /** Last time the user re-proved identity (login, MFA, password confirm). */
  authenticatedAt: Date;
  revokedAt: Date | null;
  /** Hashed, never raw: enough to spot a change, not enough to fingerprint. */
  userAgentHash: string | null;
  ipHash: string | null;
}

export class Session {
  private constructor(private props: SessionProps) {}

  static issue(input: {
    id: SessionId;
    userId: UserId;
    now: Date;
    userAgentHash?: string | null;
    ipHash?: string | null;
  }): Session {
    return new Session({
      id: input.id,
      userId: input.userId,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: new Date(input.now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
      authenticatedAt: input.now,
      revokedAt: null,
      userAgentHash: input.userAgentHash ?? null,
      ipHash: input.ipHash ?? null,
    });
  }

  static rehydrate(props: SessionProps): Session {
    return new Session(props);
  }

  get id(): SessionId {
    return this.props.id;
  }
  get userId(): UserId {
    return this.props.userId;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get lastSeenAt(): Date {
    return this.props.lastSeenAt;
  }
  get authenticatedAt(): Date {
    return this.props.authenticatedAt;
  }
  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  /** Valid for ordinary authenticated browsing. */
  validateAt(now: Date): Result<void, SessionFailure> {
    if (this.props.revokedAt !== null) return err({ _tag: 'SessionRevoked' });
    if (this.props.expiresAt <= now) return err({ _tag: 'SessionExpired' });
    if (now.getTime() - this.props.lastSeenAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
      return err({ _tag: 'SessionExpired' });
    }
    return ok(undefined);
  }

  /** Additionally requires a recent identity proof. Use before moving money. */
  validateForStepUpAt(now: Date): Result<void, SessionFailure> {
    const base = this.validateAt(now);
    if (!base.ok) return base;
    if (now.getTime() - this.props.authenticatedAt.getTime() > STEP_UP_WINDOW_MS) {
      return err({ _tag: 'StepUpRequired' });
    }
    return ok(undefined);
  }

  /**
   * Records activity, sliding the idle window.
   *
   * Returns whether the change is worth a database write: touching a row on every
   * request would make each page view a write, which is both slow and expensive on a
   * usage-billed database. One write per minute of activity is ample for an idle
   * timeout measured in hours.
   */
  touch(now: Date, minimumIntervalMs = 60_000): boolean {
    if (now.getTime() - this.props.lastSeenAt.getTime() < minimumIntervalMs) {
      return false;
    }
    this.props = { ...this.props, lastSeenAt: now };
    return true;
  }

  /** Re-proves identity, opening a fresh step-up window. */
  reauthenticate(now: Date): void {
    this.props = { ...this.props, authenticatedAt: now, lastSeenAt: now };
  }

  revoke(now: Date): void {
    if (this.props.revokedAt !== null) return; // idempotent
    this.props = { ...this.props, revokedAt: now };
  }

  snapshot(): Readonly<SessionProps> {
    return { ...this.props };
  }
}
