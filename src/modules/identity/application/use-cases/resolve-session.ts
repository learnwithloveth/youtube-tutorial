import 'server-only';

import { err, ok, type Result } from '@/shared/kernel/result';

import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';
import { toCurrentUserDto, type CurrentUserDto } from '../dto';

export interface ResolvedSession {
  user: CurrentUserDto;
  /** True when identity was proven recently enough for a money-moving action. */
  stepUpSatisfied: boolean;
}

/**
 * Turns a sealed cookie into a verified user, or nothing.
 *
 * This is the single place a session is interpreted. Everything downstream —
 * pages, actions, route handlers — asks this rather than reading the cookie itself,
 * which is what keeps the rules (revocation, idle timeout, step-up) in one auditable
 * place instead of scattered across call sites.
 *
 * Every failure returns the same undifferentiated error: a tampered cookie and an
 * expired one must be indistinguishable to the caller.
 */
export function createResolveSession(deps: IdentityDependencies) {
  return async function resolveSession(
    sealed: string | null | undefined,
  ): Promise<Result<ResolvedSession, IdentityError>> {
    if (!sealed) return err(IdentityErrors.sessionInvalid());

    // Authenticated decryption: tampering fails closed rather than decoding to some
    // other session id.
    const sessionId = await deps.sealer.unseal(sealed);
    if (sessionId === null) return err(IdentityErrors.sessionInvalid());

    const session = await deps.sessions.findById(sessionId);
    if (session === null) return err(IdentityErrors.sessionInvalid());

    const now = deps.clock.now();

    const valid = session.validateAt(now);
    if (!valid.ok) return err(IdentityErrors.sessionInvalid());

    const user = await deps.users.findById(session.userId);
    if (user === null) return err(IdentityErrors.sessionInvalid());

    // A user disabled after their session was issued must lose access immediately.
    // Checking only at login would leave a disabled account working for days.
    if (user.status === 'disabled') return err(IdentityErrors.sessionInvalid());

    // Slide the idle window, but only write when the session says it is worth a
    // round-trip — otherwise every page view becomes a database write.
    if (session.touch(now)) {
      await deps.sessions.save(session);
    }

    // One extra read on a primary key, on a path that runs for every request — and
    // it is worth it: without the name here, every surface that renders a person
    // would have to fetch it separately, which is the same read done many times
    // instead of once. Never fatal: a missing profile is the normal case.
    const profile = await deps.profiles.find(user.id).catch(() => null);

    return ok({
      user: toCurrentUserDto(user, profile),
      stepUpSatisfied: session.validateForStepUpAt(now).ok,
    });
  };
}

export type ResolveSession = ReturnType<typeof createResolveSession>;

/**
 * Ends a session.
 *
 * Revokes server-side rather than only clearing the cookie: a cookie the attacker
 * already copied would otherwise keep working until it expired.
 */
export function createSignOut(deps: IdentityDependencies) {
  return async function signOut(sealed: string | null | undefined): Promise<void> {
    if (!sealed) return;

    const sessionId = await deps.sealer.unseal(sealed);
    if (sessionId === null) return;

    const session = await deps.sessions.findById(sessionId);
    if (session === null) return;

    session.revoke(deps.clock.now());
    await deps.sessions.save(session);
  };
}

export type SignOut = ReturnType<typeof createSignOut>;

/** "Log out all devices" — the reason sessions are server-side rows at all. */
export function createRevokeAllSessions(deps: IdentityDependencies) {
  return async function revokeAllSessions(userId: Parameters<
    IdentityDependencies['sessions']['revokeAllForUser']
  >[0]): Promise<number> {
    return deps.sessions.revokeAllForUser(userId, deps.clock.now());
  };
}

export type RevokeAllSessions = ReturnType<typeof createRevokeAllSessions>;
