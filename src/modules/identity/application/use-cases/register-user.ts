import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { EmailAddress } from '../../domain/email-address';
import { validatePasswordPolicy } from '../../domain/password';
import { Profile } from '../../domain/profile';
import { User } from '../../domain/user';
import { fromProfileProblem, IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';
import type { SessionDto } from '../dto';
import { issueSession } from './issue-session';
import { sendVerificationEmail } from './send-verification-email';

export interface RegisterUserCommand {
  email: string;
  password: string;
  /**
   * Country of residence and phone number, as given on the form.
   *
   * Optional, and stored on the profile rather than on the credential — see
   * `domain/profile.ts`. The sign-up form defaults the country to where the
   * request appeared to come from, but what is kept is what was submitted: a
   * default somebody accepted is still their answer, and a guess is not.
   */
  country?: string | undefined;
  phone?: string | undefined;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Account registration.
 *
 * Uniqueness is enforced by a database unique index, not by a read-then-write check.
 * Two simultaneous registrations for the same address would both pass a prior
 * `findByEmail` and both insert; the index is the only thing that makes exactly one
 * of them win.
 *
 * ── Registration signs the user in; it does not confirm their address ───────────
 * A session is issued immediately, because being made to check your mail before you
 * can look around is a real drop-off cost for no security gain — the account has
 * nothing in it yet. What the unconfirmed address *does* gate is anything that
 * relies on us being able to reach the person: `CurrentUserDto.emailVerified` is
 * false until the link is clicked, and the platform surfaces that.
 */
export function createRegisterUser(deps: IdentityDependencies) {
  return async function registerUser(
    command: RegisterUserCommand,
  ): Promise<Result<SessionDto, IdentityError>> {
    const now = deps.clock.now();

    const email = EmailAddress.parse(command.email);
    if (!email.ok) return err(IdentityErrors.emailMalformed());

    const policy = validatePasswordPolicy(command.password);
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

    const passwordHash = await deps.hasher.hash(command.password);
    const id = deps.users.nextId();

    // Built and checked before the account exists, so a phone number typed without
    // its dialling code refuses the form rather than leaving a registered account
    // whose owner never saw the error.
    const profile = Profile.empty(id, now);
    const [problem] = profile.update({ country: command.country, phone: command.phone }, now);
    if (problem !== undefined) return err(fromProfileProblem(problem));

    const user = User.register({
      id,
      email: email.value,
      passwordHash,
      now,
    });

    // The unique index decides the race, not application code.
    const inserted = await deps.users.insertIfEmailFree(user);
    if (!inserted) {
      return err(IdentityErrors.emailAlreadyRegistered());
    }

    // Only when there is something to store. Most accounts set neither, and the
    // profile row is created on demand for exactly that reason.
    if (profile.country !== null || profile.phone !== null) {
      await deps.profiles.save(profile);
    }

    // Deliberately not awaited into the result: a mail transport that is down must
    // not roll back a created account. The user is registered either way and can
    // ask for another link. `sendVerificationEmail` logs its own failures.
    await sendVerificationEmail(deps, user, now);

    return ok(await issueSession(deps, user, command, now));
  };
}

export type RegisterUser = ReturnType<typeof createRegisterUser>;
