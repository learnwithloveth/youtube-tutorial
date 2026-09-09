import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { validatePasswordPolicy } from '../../domain/password';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';

export interface ResetPasswordCommand {
  token: string;
  newPassword: string;
}

/**
 * Completes a password reset from a mailed link.
 *
 * Three things happen together, and all three are required:
 *
 * 1. The token is consumed, so the link cannot be replayed.
 * 2. The password is replaced.
 * 3. **Every existing session for that user is revoked.**
 *
 * The third is the one that is easy to leave out and the one that matters most.
 * A password reset is the remedy for a compromised account; if the attacker's
 * session survives it, the reset has achieved nothing except locking the real owner
 * into sharing their account. Revoking everything forces the attacker back to a
 * login screen they can no longer pass.
 *
 * The address is also confirmed as a side effect: the user just proved they receive
 * mail there, which is precisely what verification asks. Requiring a second,
 * separate confirmation afterwards would be theatre.
 */
export function createResetPassword(deps: IdentityDependencies) {
  return async function resetPassword(
    command: ResetPasswordCommand,
  ): Promise<Result<void, IdentityError>> {
    if (!command.token) return err(IdentityErrors.verificationTokenInvalid());

    const now = deps.clock.now();

    const record = await deps.tokens.findByHash(deps.tokenHasher.hash(command.token));
    if (record === null) return err(IdentityErrors.verificationTokenInvalid());

    const redeemable = record.canBeRedeemedAt(now, 'password-reset');
    if (!redeemable.ok) {
      return err(
        redeemable.error._tag === 'TokenExpired'
          ? IdentityErrors.verificationTokenExpired()
          : IdentityErrors.verificationTokenInvalid(),
      );
    }

    // Policy is checked after the token, so an invalid token never reveals the
    // password rules to someone who does not hold a valid link — and before any
    // mutation, so a rejected password leaves the link usable for another try.
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

    const user = await deps.users.findById(record.userId);
    if (user === null) return err(IdentityErrors.verificationTokenInvalid());

    record.consume(now);
    await deps.tokens.save(record);

    user.replacePasswordHash(await deps.hasher.hash(command.newPassword));
    // A locked-out user resetting their password should be able to sign in again;
    // the lockout counter exists to slow guessing, not to outlive the credential.
    user.recordSuccessfulAuthentication();
    // Clicking the link proved control of the address.
    user.verifyEmail(now);
    await deps.users.save(user);

    await deps.sessions.revokeAllForUser(user.id, now);

    return ok(undefined);
  };
}

export type ResetPassword = ReturnType<typeof createResetPassword>;
