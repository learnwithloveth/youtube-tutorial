import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';
import type { UserId } from '@/shared/kernel/ids';

import { validatePasswordPolicy } from '../../domain/password';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';

export interface ChangePasswordCommand {
  userId: UserId;
  /** Null only for an account that has never had one — see below. */
  currentPassword: string | null;
  newPassword: string;
  /**
   * The caller's sealed session cookie. Every *other* session is revoked.
   *
   * The sealed form rather than a session id, so the raw id stays inside this
   * module — the delivery layer holds a cookie and nothing else, which is the same
   * arrangement `resolveSession` has.
   */
  sealedSession: string;
}

export interface ChangePasswordResult {
  /** How many other devices were signed out. */
  revokedSessions: number;
}

/**
 * Changes the password of somebody who is already signed in.
 *
 * ── Proving it is really them, twice over ─────────────────────────────────────
 * Holding a session is not enough. A borrowed laptop or a stolen cookie would
 * otherwise be enough to set a new password and own the account outright, so the
 * current password is required — the one thing the person at the keyboard has to
 * know rather than merely possess.
 *
 * An account created through Google has no current password to ask for. The
 * substitute is freshness: the session must have authenticated inside the step-up
 * window, the same rule money movement uses. A stale session is told to sign in
 * again, which for that account means going back through Google — an assertion
 * from the provider, which is exactly the proof that is missing.
 *
 * ── Every other session goes ──────────────────────────────────────────────────
 * The reason to change a password is usually the suspicion that somebody else has
 * it, and a change that leaves their session alive achieves nothing. This one is
 * kept: signing somebody out of the device they are standing at only makes them log
 * in again. A reset from a mailed link still revokes *everything*, because there
 * the session that might be the attacker's is the one you cannot identify.
 */
export function createChangePassword(deps: IdentityDependencies) {
  return async function changePassword(
    command: ChangePasswordCommand,
  ): Promise<Result<ChangePasswordResult, IdentityError>> {
    const now = deps.clock.now();

    const user = await deps.users.findById(command.userId);
    if (user === null) return err(IdentityErrors.sessionInvalid());
    if (user.status === 'disabled') return err(IdentityErrors.accountDisabled());

    // Resolved here rather than trusted: the id that survives this is the one
    // session left alive at the end, so it has to be this caller's and still valid.
    const sessionId = await deps.sealer.unseal(command.sealedSession);
    if (sessionId === null) return err(IdentityErrors.sessionInvalid());

    const session = await deps.sessions.findById(sessionId);
    if (session === null || session.userId !== command.userId || !session.validateAt(now).ok) {
      return err(IdentityErrors.sessionInvalid());
    }

    const current = user.passwordHash;

    if (current === null) {
      if (!session.validateForStepUpAt(now).ok) return err(IdentityErrors.stepUpRequired());
    } else {
      if (command.currentPassword === null || command.currentPassword.length === 0) {
        return err(IdentityErrors.currentPasswordIncorrect());
      }
      const matches = await deps.hasher.verify(command.currentPassword, current);
      if (!matches) return err(IdentityErrors.currentPasswordIncorrect());
    }

    const policy = validatePasswordPolicy(command.newPassword);
    if (!policy.ok) {
      switch (policy.error._tag) {
        case 'PasswordTooShort':
          return err(IdentityErrors.passwordTooShort(policy.error.minimum));
        case 'PasswordTooLong':
          return err(IdentityErrors.passwordTooLong(policy.error.maximum));
        case 'PasswordTooCommon':
          return err(IdentityErrors.passwordTooCommon());
      }
    }

    // Checked against the old hash rather than by comparing the two plaintexts,
    // because only one of them is in hand — and "nothing happened" is a confusing
    // outcome for somebody who came here to change something.
    if (current !== null && (await deps.hasher.verify(command.newPassword, current))) {
      return err(IdentityErrors.passwordUnchanged());
    }

    user.replacePasswordHash(await deps.hasher.hash(command.newPassword));
    await deps.users.save(user);

    const revokedSessions = await deps.sessions.revokeOthersForUser(user.id, sessionId, now);

    return ok({ revokedSessions });
  };
}

export type ChangePassword = ReturnType<typeof createChangePassword>;
