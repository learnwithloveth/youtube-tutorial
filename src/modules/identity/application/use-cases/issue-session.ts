import 'server-only';

import { Session } from '../../domain/session';
import type { User } from '../../domain/user';
import type { IdentityDependencies } from '../ports';
import type { SessionDto } from '../dto';

/**
 * Starts a session and seals it for the cookie.
 *
 * One definition, shared by every way of proving identity: registration, password
 * sign-in and Google. Three copies of this is how one of them quietly stops hashing
 * the user agent, or issues a session whose `authenticatedAt` is wrong — and
 * `authenticatedAt` is what the step-up window for money movement reads.
 */
export interface SessionContext {
  readonly userAgent?: string | null | undefined;
  readonly ipAddress?: string | null | undefined;
}

export async function issueSession(
  deps: IdentityDependencies,
  user: User,
  context: SessionContext,
  now: Date,
): Promise<SessionDto> {
  const session = Session.issue({
    id: deps.sessions.nextId(),
    userId: user.id,
    now,
    // Hashed, not raw: enough to notice a change, not enough to fingerprint, and
    // safe to keep under a long retention policy.
    userAgentHash: context.userAgent ? deps.digest.hash(context.userAgent) : null,
    ipHash: context.ipAddress ? deps.digest.hash(context.ipAddress) : null,
  });
  await deps.sessions.save(session);

  return {
    sealed: await deps.sealer.seal(session.id),
    expiresAt: session.expiresAt.toISOString(),
    userId: user.id,
  };
}
