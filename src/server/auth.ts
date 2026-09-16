import 'server-only';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import type { CurrentUserDto, SessionSummaryDto, SignInMethodsDto } from '@/modules/identity';
import {
  getSignInMethods,
  registerIdentity,
  SESSION_COOKIE_NAME,
  type IdentityModule,
} from '@/modules/identity/server';
import type { UserId } from '@/shared/kernel/ids';
import { requireDb } from '@/platform/db/client';
import { env, googleOAuthConfig, sessionSecret, smtpConfig } from '@/platform/env';
import { logger } from '@/platform/observability/logger';

/**
 * The application's authentication facade.
 *
 * Pages, actions and route handlers call these. They do not build the identity
 * module, and they do not read the session cookie themselves — that is the whole
 * point. One place interprets a session, so the rules that govern it (revocation,
 * idle timeout, step-up freshness) live somewhere auditable instead of being
 * re-implemented slightly differently at thirty call sites.
 */

/**
 * `React.cache` gives one module instance per request.
 *
 * Not a singleton: a module-level instance would capture a database handle across
 * requests, and in the identity module's case would also outlive the environment it
 * was configured from. Per-request is the correct lifetime, and `cache` makes
 * repeated calls within one render return the same instance rather than rebuilding
 * a scrypt hasher and an SMTP pool each time.
 */
export const identity = cache((): IdentityModule => {
  const smtp = smtpConfig();
  const google = googleOAuthConfig();
  return registerIdentity({
    db: requireDb(),
    sessionSecret: sessionSecret(),
    appUrl: env().APP_URL,
    ...(smtp ? { smtp } : {}),
    ...(google ? { google } : {}),
  });
});

export interface AuthState {
  user: CurrentUserDto | null;
  /** True when identity was proven recently enough for a money-moving action. */
  stepUpSatisfied: boolean;
}

const SIGNED_OUT: AuthState = { user: null, stepUpSatisfied: false };

/**
 * The current session, or a signed-out state.
 *
 * Deduplicated per request, so a layout and three components asking for the user
 * cost one session lookup rather than four.
 *
 * Never throws for an absent or invalid session — being signed out is an ordinary
 * state, not an error. A missing database *is* an error, and does throw: silently
 * treating an unreachable database as "signed out" would let an outage look like a
 * logout and could hide a real failure behind a login screen.
 */
export const getAuth = cache(async (): Promise<AuthState> => {
  const store = await cookies();
  const sealed = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sealed) return SIGNED_OUT;

  const result = await identity().resolveSession(sealed);
  if (!result.ok) return SIGNED_OUT;

  return { user: result.value.user, stepUpSatisfied: result.value.stepUpSatisfied };
});

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<CurrentUserDto | null> {
  return (await getAuth()).user;
}

/**
 * The signed-in user, or a redirect to the login page.
 *
 * `next` carries the path the visitor was trying to reach so they land there after
 * signing in rather than on a generic home page.
 */
export async function requireUser(returnTo?: string): Promise<CurrentUserDto> {
  const { user } = await getAuth();
  if (user) return user;

  const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login';
  redirect(target);
}

/**
 * The cookie name, re-exported so delivery code never spells it out.
 *
 * Imported from the module rather than declared here: the module owns the cookie
 * it seals, and two definitions of this string is exactly the kind of drift that
 * produces a logout that does not log anyone out.
 */
export { SESSION_COOKIE_NAME as SESSION_COOKIE };

/**
 * The caller's own live sessions, newest activity first.
 *
 * Reads the cookie here rather than taking a session id from the caller: this
 * feeds a page that offers to end sessions, and a caller-supplied id is how one
 * account's page ends another account's session.
 */
export const getSessions = cache(async (): Promise<SessionSummaryDto[]> => {
  const { user } = await getAuth();
  if (user === null) return [];

  const sealed = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;

  try {
    return await identity().listSessions(user.id, sealed);
  } catch (error) {
    // The security page also shows the account and its verification state; losing
    // the session list should cost that panel, not the page.
    logger.warn({ event: 'session_list_failed', module: 'identity' }, error);
    return [];
  }
});

/**
 * How one account can be signed in: password, provider, or both.
 *
 * Takes the id from the caller's own `requireUser()`. This answers a question about
 * credentials, so it answers it for exactly one account and never for an id that
 * arrived in a request.
 */
export const getSignInMethodsFor = cache(
  async (userId: UserId): Promise<SignInMethodsDto> =>
    getSignInMethods(identity().dependencies, userId),
);

/**
 * Ends every session for the signed-in user, including this one.
 *
 * "Log out everywhere" is the reason sessions are server-side rows at all — it
 * takes effect immediately rather than whenever a JWT would have expired. It
 * deliberately includes the current session: someone who believes their account is
 * compromised should not have to reason about which device they are on, and
 * leaving one live is the one that might not be theirs.
 */
export async function revokeAllSessions(): Promise<number> {
  const { user } = await getAuth();
  if (user === null) return 0;

  return identity().revokeAllSessions(user.id);
}

/**
 * The signed-in user, required to be an operator.
 *
 * A signed-out visitor is sent to sign in. A signed-in customer gets a 404, not
 * a 403: telling them the console exists and they are not allowed in confirms
 * the URL is real, which is the first thing an attacker wants to know. As far as
 * a customer is concerned, `/admin` is not a page.
 *
 * This is the authorisation boundary for the console. The proxy's cookie check
 * cannot do it — the proxy never unseals the cookie, so it cannot know a role.
 */
export async function requireAdmin(returnTo?: string): Promise<CurrentUserDto> {
  const user = await requireUser(returnTo);
  if (user.role !== 'admin') notFound();
  return user;
}
