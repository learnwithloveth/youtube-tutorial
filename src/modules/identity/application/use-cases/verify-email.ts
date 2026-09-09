import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { EmailAddress } from '../../domain/email-address';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';
import { sendPasswordResetEmail, sendVerificationEmail } from './send-verification-email';

/**
 * Confirms an email address from a mailed link.
 *
 * ── This does not sign anyone in ────────────────────────────────────────────────
 * The token proves only that someone received mail at the address. Verification
 * links get prefetched by scanners, forwarded, and left in inboxes; issuing a
 * session here would turn every one of those into a login. The page that consumes
 * this asks the user to sign in normally afterwards.
 */
export function createConfirmEmail(deps: IdentityDependencies) {
  return async function confirmEmail(token: string): Promise<Result<void, IdentityError>> {
    if (!token) return err(IdentityErrors.verificationTokenInvalid());

    const now = deps.clock.now();

    // Looked up by digest. The raw token is never stored, so there is nothing in
    // the database that could be replayed if it leaked.
    const record = await deps.tokens.findByHash(deps.tokenHasher.hash(token));
    if (record === null) return err(IdentityErrors.verificationTokenInvalid());

    const redeemable = record.canBeRedeemedAt(now, 'email-verification');
    if (!redeemable.ok) {
      // Expiry is separated from the rest because it has an actionable remedy.
      // "Used" and "wrong purpose" collapse into "invalid" so a stolen link cannot
      // be probed for whether it was ever genuine.
      return err(
        redeemable.error._tag === 'TokenExpired'
          ? IdentityErrors.verificationTokenExpired()
          : IdentityErrors.verificationTokenInvalid(),
      );
    }

    const user = await deps.users.findById(record.userId);
    if (user === null) return err(IdentityErrors.verificationTokenInvalid());

    // Consume before mutating the user. If the save below fails, the token is
    // already spent — the safe direction to fail, since the user can request
    // another link but an attacker cannot reuse this one.
    record.consume(now);
    await deps.tokens.save(record);

    if (user.isEmailVerified) return ok(undefined); // idempotent: a double click

    user.verifyEmail(now);
    await deps.users.save(user);

    return ok(undefined);
  };
}

export type ConfirmEmail = ReturnType<typeof createConfirmEmail>;

/**
 * Sends another verification link.
 *
 * Called from the signed-in banner, so the user is already known. Returns
 * `EmailAlreadyVerified` when there is nothing to do — that is not a leak, because
 * the caller has already proved they are that user.
 */
export function createResendVerification(deps: IdentityDependencies) {
  return async function resendVerification(
    userId: Parameters<IdentityDependencies['users']['findById']>[0],
  ): Promise<Result<void, IdentityError>> {
    const user = await deps.users.findById(userId);
    if (user === null) return err(IdentityErrors.sessionInvalid());
    if (user.isEmailVerified) return err(IdentityErrors.emailAlreadyVerified());

    await sendVerificationEmail(deps, user, deps.clock.now());
    return ok(undefined);
  };
}

export type ResendVerification = ReturnType<typeof createResendVerification>;

/**
 * Starts a password reset.
 *
 * ── Always reports success ──────────────────────────────────────────────────────
 * Returning "no account with that address" would turn this unauthenticated,
 * rate-limit-free-by-default endpoint into an account enumeration oracle: an
 * attacker submits a list of addresses and learns which are registered. So an
 * unknown address takes the same path, produces the same response, and sends
 * nothing.
 */
export function createRequestPasswordReset(deps: IdentityDependencies) {
  return async function requestPasswordReset(rawEmail: string): Promise<void> {
    const email = EmailAddress.parse(rawEmail);
    if (!email.ok) return;

    const user = await deps.users.findByEmail(email.value);
    if (user === null) return;

    // A disabled account must not be recoverable by mail.
    if (user.status === 'disabled') return;

    await sendPasswordResetEmail(deps, user, deps.clock.now());
  };
}

export type RequestPasswordReset = ReturnType<typeof createRequestPasswordReset>;
