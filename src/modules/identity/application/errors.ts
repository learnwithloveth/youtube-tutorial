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

import { MAX_DISPLAY_NAME, MAX_PERSON_NAME, type ProfileProblem } from '../domain/profile';

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
  | { _tag: 'NameTooLong'; maximum: number }
  | { _tag: 'DisplayNameTooLong'; maximum: number }
  | { _tag: 'HandleInvalid' }
  | { _tag: 'HandleTaken' }
  | { _tag: 'AdministratorNotFound' }
  | { _tag: 'CannotSuspendSelf' }
  | { _tag: 'LastAdministrator' }
  | { _tag: 'VerificationNameRequired' }
  | { _tag: 'VerificationCountryRequired' }
  | { _tag: 'VerificationDocumentNumberRequired' }
  | { _tag: 'VerificationDateOfBirthInvalid'; minimumAge: number }
  | { _tag: 'VerificationDocumentRejected'; why: string }
  | { _tag: 'VerificationAlreadyPending' }
  | { _tag: 'VerificationAlreadyApproved' }
  | { _tag: 'VerificationNotFound' }
  | { _tag: 'VerificationAlreadyDecided'; status: string }
  | { _tag: 'VerificationReasonRequired' }
  | { _tag: 'CurrentPasswordIncorrect' }
  | { _tag: 'PasswordUnchanged' }
  | { _tag: 'ProviderEmailUnverified'; provider: string }
  | { _tag: 'ProviderAccountLinkedElsewhere'; provider: string }
  | { _tag: 'ProviderAlreadyConnected'; provider: string }
  | { _tag: 'ProviderNotConnected'; provider: string }
  | { _tag: 'LastSignInMethod'; provider: string }
  | { _tag: 'CountryInvalid' }
  | { _tag: 'PhoneInvalid' };

export const IdentityErrors = {
  verificationNameRequired: (): IdentityError => ({ _tag: 'VerificationNameRequired' }),
  verificationCountryRequired: (): IdentityError => ({ _tag: 'VerificationCountryRequired' }),
  verificationDocumentNumberRequired: (): IdentityError => ({
    _tag: 'VerificationDocumentNumberRequired',
  }),
  verificationDateOfBirthInvalid: (minimumAge: number): IdentityError => ({
    _tag: 'VerificationDateOfBirthInvalid',
    minimumAge,
  }),
  verificationDocumentRejected: (why: string): IdentityError => ({
    _tag: 'VerificationDocumentRejected',
    why,
  }),
  verificationAlreadyPending: (): IdentityError => ({ _tag: 'VerificationAlreadyPending' }),
  verificationAlreadyApproved: (): IdentityError => ({ _tag: 'VerificationAlreadyApproved' }),
  verificationNotFound: (): IdentityError => ({ _tag: 'VerificationNotFound' }),
  verificationAlreadyDecided: (status: string): IdentityError => ({
    _tag: 'VerificationAlreadyDecided',
    status,
  }),
  verificationReasonRequired: (): IdentityError => ({ _tag: 'VerificationReasonRequired' }),
  currentPasswordIncorrect: (): IdentityError => ({ _tag: 'CurrentPasswordIncorrect' }),
  passwordUnchanged: (): IdentityError => ({ _tag: 'PasswordUnchanged' }),
  providerEmailUnverified: (provider: string): IdentityError => ({
    _tag: 'ProviderEmailUnverified',
    provider,
  }),
  providerAccountLinkedElsewhere: (provider: string): IdentityError => ({
    _tag: 'ProviderAccountLinkedElsewhere',
    provider,
  }),
  providerAlreadyConnected: (provider: string): IdentityError => ({
    _tag: 'ProviderAlreadyConnected',
    provider,
  }),
  providerNotConnected: (provider: string): IdentityError => ({
    _tag: 'ProviderNotConnected',
    provider,
  }),
  lastSignInMethod: (provider: string): IdentityError => ({ _tag: 'LastSignInMethod', provider }),
  countryInvalid: (): IdentityError => ({ _tag: 'CountryInvalid' }),
  phoneInvalid: (): IdentityError => ({ _tag: 'PhoneInvalid' }),
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
  nameTooLong: (): IdentityError => ({ _tag: 'NameTooLong', maximum: MAX_PERSON_NAME }),
  handleInvalid: (): IdentityError => ({ _tag: 'HandleInvalid' }),
  handleTaken: (): IdentityError => ({ _tag: 'HandleTaken' }),
  administratorNotFound: (): IdentityError => ({ _tag: 'AdministratorNotFound' }),
  cannotSuspendSelf: (): IdentityError => ({ _tag: 'CannotSuspendSelf' }),
  lastAdministrator: (): IdentityError => ({ _tag: 'LastAdministrator' }),
} as const;

/**
 * A `Profile.update` refusal, as an error the forms can render.
 *
 * One mapping, because two use cases set profile fields — registration and the
 * settings form — and a second copy is how the same bad phone number comes back
 * with two different messages depending on where it was typed.
 */
export function fromProfileProblem(problem: ProfileProblem): IdentityError {
  switch (problem) {
    case 'name-too-long':
      return IdentityErrors.nameTooLong();
    case 'handle-invalid':
      return IdentityErrors.handleInvalid();
    case 'country-invalid':
      return IdentityErrors.countryInvalid();
    case 'phone-invalid':
      return IdentityErrors.phoneInvalid();
    case 'display-name-too-long':
      return IdentityErrors.displayNameTooLong();
  }
}


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
      /*
       * Never "confirm your password".
       *
       * This is raised in exactly one place — setting a *first* password on an
       * account that has none, where the recent-sign-in proof stands in for the
       * current password nobody has. Asking somebody to confirm a password they do
       * not have is an instruction that cannot be followed, and it was on screen
       * for every Google-only account whose session was more than five minutes old.
       */
      return 'For your security, sign in again before setting a password.';
    case 'CurrentPasswordIncorrect':
      return 'That is not your current password.';
    case 'PasswordUnchanged':
      return 'That is already your password. Choose a different one.';
    case 'ProviderEmailUnverified':
      // Why the sign-in was refused rather than what to do about it, because the
      // remedy is on the provider's side and telling somebody to "try again" here
      // would send them round the same loop.
      return `${error.provider} has not confirmed the address on that account, so it cannot be used to sign in.`;
    case 'ProviderAccountLinkedElsewhere':
      // No site name: nothing is injected into a pure function, and the sentence is
      // exactly as clear without one — which also keeps it true under any name.
      return `That ${error.provider} account is already connected to another account.`;
    case 'ProviderAlreadyConnected':
      return `A ${error.provider} account is already connected. Disconnect it first.`;
    case 'ProviderNotConnected':
      return `No ${error.provider} account is connected.`;
    case 'CountryInvalid':
      return 'Choose a country from the list.';
    case 'PhoneInvalid':
      // Says what the form wants rather than "invalid": a number without its
      // dialling code is the mistake people actually make here.
      return 'Enter your number in international form, starting with your dialling code — for example +41 79 123 45 67.';
    case 'LastSignInMethod':
      return `Set a password first. Disconnecting ${error.provider} now would leave no way to sign in.`;
    case 'RateLimited':
      return `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`;
    case 'VerificationTokenInvalid':
      return 'That link is not valid. Request a new one.';
    case 'VerificationTokenExpired':
      return 'That link has expired. Request a new one.';
    case 'EmailAlreadyVerified':
      return 'That address is already confirmed. You can sign in.';
    case 'NameTooLong':
      // Both halves share one message: the rule and the remedy are the same.
      return `A first or last name can be at most ${error.maximum} characters.`;
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
    case 'VerificationNameRequired':
      return 'Enter your name exactly as it appears on the document.';
    case 'VerificationCountryRequired':
      return 'Choose the country that issued the document.';
    case 'VerificationDocumentNumberRequired':
      return 'Enter the document number.';
    case 'VerificationDateOfBirthInvalid':
      // The rule, not "invalid": somebody refused for being a day under the
      // threshold needs to know a threshold exists.
      return `Enter your date of birth. Account holders must be at least ${error.minimumAge}.`;
    case 'VerificationDocumentRejected':
      return error.why;
    case 'VerificationAlreadyPending':
      // Not "we will email you": nothing sends mail about a decision. It reaches
      // the customer's notifications and their Verification tab.
      return 'You already have a submission waiting. You will be notified when it is reviewed.';
    case 'VerificationAlreadyApproved':
      return 'Your identity is already verified.';
    case 'VerificationNotFound':
      return 'That submission no longer exists.';
    case 'VerificationAlreadyDecided':
      return `This submission was already ${error.status}.`;
    case 'VerificationReasonRequired':
      return 'A rejection needs a reason. The customer is shown it.';
  }
}
