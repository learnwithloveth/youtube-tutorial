import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { EmailAddress } from '../../domain/email-address';
import { validatePasswordPolicy } from '../../domain/password';
import { Session } from '../../domain/session';
import { User } from '../../domain/user';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';
import type { SessionDto } from '../dto';
import { sendVerificationEmail } from './send-verification-email';

export interface RegisterUserCommand {
  email: string;
  password: string;
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

    const user = User.register({
      id: deps.users.nextId(),
      email: email.value,
      passwordHash,
      now,
    });

    // The unique index decides the race, not application code.
    const inserted = await deps.users.insertIfEmailFree(user);
    if (!inserted) {
      return err(IdentityErrors.emailAlreadyRegistered());
    }

    // Deliberately not awaited into the result: a mail transport that is down must
    // not roll back a created account. The user is registered either way and can
    // ask for another link. `sendVerificationEmail` logs its own failures.
    await sendVerificationEmail(deps, user, now);

    const session = Session.issue({
      id: deps.sessions.nextId(),
      userId: user.id,
      now,
      userAgentHash: command.userAgent ? deps.digest.hash(command.userAgent) : null,
      ipHash: command.ipAddress ? deps.digest.hash(command.ipAddress) : null,
    });
    await deps.sessions.save(session);

    return ok({
      sealed: await deps.sealer.seal(session.id),
      expiresAt: session.expiresAt.toISOString(),
      userId: user.id,
    });
  };
}

export type RegisterUser = ReturnType<typeof createRegisterUser>;
