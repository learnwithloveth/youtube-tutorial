/**
 * The identity module's error catalogue.
 *
 * Tagged unions rather than message strings: a `switch` over `_tag` can be checked
 * for exhaustiveness, so adding a variant fails to compile until every caller
 * handles it. A message string offers no such guarantee.
 *
 * No `server-only` here, deliberately. The forms render these messages, so the
 * presenter has to be reachable from a Client Component — and it is safe to be,
 * because it contains no secrets and no I/O.
 */

import { MAX_DISPLAY_NAME } from '../domain/profile';

export type IdentityError =
  | { _tag: 'EmailMalformed' }
  | { _tag: 'EmailAlreadyRegistered' }
  | { _tag: 'PasswordTooShort'; minimum: number }
  | { _tag: 'PasswordTooLong'; maximum: number }
  | { _tag: 'PasswordTooCommon' }
  | { _tag: 'InvalidCredentials' }
  | { _tag: 'AccountLocked'; until: string }
  | { _tag: 'AccountDisabled' }
  | { _tag: 'SessionInvalid' }
  | { _tag: 'StepUpRequired' }
  | { _tag: 'RateLimited'; retryAfterSeconds: number }
  | { _tag: 'VerificationTokenInvalid' }
  | { _tag: 'VerificationTokenExpired' }
  | { _tag: 'EmailAlreadyVerified' }
  | { _tag: 'DisplayNameTooLong'; maximum: number }
  | { _tag: 'HandleInvalid' }
  | { _tag: 'HandleTaken' }
  | { _tag: 'AdministratorNotFound' }
  | { _tag: 'CannotSuspendSelf' }
  | { _tag: 'LastAdministrator' };

export const IdentityErrors = {
  emailMalformed: (): IdentityError => ({ _tag: 'EmailMalformed' }),
  emailAlreadyRegistered: (): IdentityError => ({ _tag: 'EmailAlreadyRegistered' }),
  passwordTooShort: (minimum: number): IdentityError => ({ _tag: 'PasswordTooShort', minimum }),
  passwordTooLong: (maximum: number): IdentityError => ({ _tag: 'PasswordTooLong', maximum }),
  passwordTooCommon: (): IdentityError => ({ _tag: 'PasswordTooCommon' }),
  /**
   * Deliberately undifferentiated.
   *
   * "No account with that email" versus "wrong password" is an account-enumeration
   * oracle: an attacker learns which addresses are registered. One message for both,
   * always.
   */
  invalidCredentials: (): IdentityError => ({ _tag: 'InvalidCredentials' }),
  accountLocked: (until: Date): IdentityError => ({
    _tag: 'AccountLocked',
    until: until.toISOString(),
  }),
  accountDisabled: (): IdentityError => ({ _tag: 'AccountDisabled' }),
  sessionInvalid: (): IdentityError => ({ _tag: 'SessionInvalid' }),
  stepUpRequired: (): IdentityError => ({ _tag: 'StepUpRequired' }),
  rateLimited: (retryAfterSeconds: number): IdentityError => ({
    _tag: 'RateLimited',
    retryAfterSeconds,
  }),
  /**
   * One error for "no such token", "already used" and "wrong purpose".
   *
   * Distinguishing them tells an attacker holding a stolen link whether it was
   * genuine, which is exactly the thing they cannot otherwise determine. Expiry is
   * separated only because it has a real, actionable remedy: request another.
   */
  verificationTokenInvalid: (): IdentityError => ({ _tag: 'VerificationTokenInvalid' }),
  verificationTokenExpired: (): IdentityError => ({ _tag: 'VerificationTokenExpired' }),
  emailAlreadyVerified: (): IdentityError => ({ _tag: 'EmailAlreadyVerified' }),
  displayNameTooLong: (): IdentityError => ({
    _tag: 'DisplayNameTooLong',
    maximum: MAX_DISPLAY_NAME,
  }),
  handleInvalid: (): IdentityError => ({ _tag: 'HandleInvalid' }),
  handleTaken: (): IdentityError => ({ _tag: 'HandleTaken' }),
  administratorNotFound: (): IdentityError => ({ _tag: 'AdministratorNotFound' }),
  cannotSuspendSelf: (): IdentityError => ({ _tag: 'CannotSuspendSelf' }),
  lastAdministrator: (): IdentityError => ({ _tag: 'LastAdministrator' }),
} as const;

/**
 * User-facing copy.
 *
 * Every branch is written to leak nothing about whether an account exists, what the
 * stored hash looks like, or how our internals are structured.
 */
export function presentIdentityError(error: IdentityError): string {
  switch (error._tag) {
    case 'EmailMalformed':
      return 'Enter a valid email address.';
    case 'EmailAlreadyRegistered':
      // Shown only where the user already proved control of the address.
      return 'That email is already registered. Try signing in instead.';
    case 'PasswordTooShort':
      return `Use at least ${error.minimum} characters.`;
    case 'PasswordTooLong':
      return `Use at most ${error.maximum} characters.`;
    case 'PasswordTooCommon':
      return 'That password appears in known breach lists. Choose another.';
    case 'InvalidCredentials':
      return 'Email or password is incorrect.';
    case 'AccountLocked':
      return 'Too many attempts. Your account is temporarily locked.';
    case 'AccountDisabled':
      return 'This account is not available. Contact support.';
    case 'SessionInvalid':
      return 'Your session has ended. Please sign in again.';
    case 'StepUpRequired':
      return 'Confirm your password to continue.';
    case 'RateLimited':
      return `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`;
    case 'VerificationTokenInvalid':
      return 'That link is not valid. Request a new one.';
    case 'VerificationTokenExpired':
      return 'That link has expired. Request a new one.';
    case 'EmailAlreadyVerified':
      return 'That address is already confirmed. You can sign in.';
    case 'DisplayNameTooLong':
      return `That name is longer than ${error.maximum} characters.`;
    case 'HandleInvalid':
      // Says the rule rather than "invalid": somebody who typed "Amara K" needs to
      // know what to type instead, not that they were wrong.
      return 'A handle is 3 to 24 characters, using lowercase letters, numbers and underscores.';
    case 'HandleTaken':
      return 'That handle is already taken.';
    case 'AdministratorNotFound':
      return 'That administrator no longer exists.';
    case 'CannotSuspendSelf':
      // Says what to do instead, because the reflex is to try again harder.
      return 'You cannot suspend your own account. Ask another administrator.';
    case 'LastAdministrator':
      return 'This is the only active administrator. Suspending it would lock everyone out of the console.';
  }
}
