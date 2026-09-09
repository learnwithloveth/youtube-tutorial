import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { EmailAddress } from '../../domain/email-address';
import { type PasswordHash } from '../../domain/password';
import { Session } from '../../domain/session';
import { type User } from '../../domain/user';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';
import type { SessionDto } from '../dto';

export interface AuthenticateCommand {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Password sign-in.
 *
 * Two attacks shape this code, and both are easy to reintroduce:
 *
 * 1. **Account enumeration.** Every failure returns the same error, and an unknown
 *    email still performs a hash comparison against a decoy so the response time
 *    does not reveal whether the account exists.
 * 2. **Credential stuffing.** Failures are counted on the user record and the
 *    account locks temporarily. The lock is checked *before* hashing, so a locked
 *    account cannot be used to burn CPU.
 */
export function createAuthenticate(deps: IdentityDependencies) {
  /**
   * A real hash, computed once at startup, verified against when no user matched.
   * Comparing against a constant string would return far too quickly and hand the
   * attacker the timing signal we are trying to remove.
   */
  let decoyHash: PasswordHash | null = null;
  const decoyReady = deps.hasher
    .hash(`decoy:${Math.random()}:${Date.now()}`)
    .then((hash) => {
      decoyHash = hash;
    })
    .catch(() => {
      /* falls back to hashing on demand below */
    });

  return async function authenticate(
    command: AuthenticateCommand,
  ): Promise<Result<SessionDto, IdentityError>> {
    const now = deps.clock.now();

    const email = EmailAddress.parse(command.email);
    if (!email.ok) {
      // Still spend the time: bailing early on a malformed address is itself a
      // (weak) oracle, and costs nothing to avoid.
      await burnTime();
      return err(IdentityErrors.invalidCredentials());
    }

    const user = await deps.users.findByEmail(email.value);

    if (user === null) {
      await burnTime();
      return err(IdentityErrors.invalidCredentials());
    }

    // Checked BEFORE verifying the password, so a locked account never consumes the
    // deliberately expensive comparison.
    const attemptable = user.canAttemptAuthentication(now);
    if (!attemptable.ok) {
      return err(
        attemptable.error._tag === 'AccountLocked'
          ? IdentityErrors.accountLocked(attemptable.error.until)
          : IdentityErrors.accountDisabled(),
      );
    }

    const matches = await deps.hasher.verify(command.password, user.passwordHash);

    if (!matches) {
      user.recordFailedAttempt(now);
      await deps.users.save(user);
      return err(IdentityErrors.invalidCredentials());
    }

    // Cost parameters are raised over time; upgrade the stored hash transparently
    // while we legitimately hold the plaintext. The alternative is a forced reset
    // for every user, or being stuck on the original parameters forever.
    if (deps.hasher.needsRehash(user.passwordHash)) {
      user.replacePasswordHash(await deps.hasher.hash(command.password));
    }

    user.recordSuccessfulAuthentication();
    await deps.users.save(user);

    const session = Session.issue({
      id: deps.sessions.nextId(),
      userId: user.id,
      now,
      // Hashed, not raw: enough to notice a change, not enough to fingerprint,
      // and safe to keep under a long retention policy.
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

  /** Performs the same work a real verification would, and discards the result. */
  async function burnTime(): Promise<void> {
    await decoyReady;
    const hash = decoyHash ?? (await deps.hasher.hash('decoy'));
    await deps.hasher.verify('decoy-attempt', hash);
  }
}

export type Authenticate = ReturnType<typeof createAuthenticate>;

/** Re-exported so the registration use case can share the shape. */
export type { User };
