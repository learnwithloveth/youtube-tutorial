import 'server-only';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import type { CurrentUserDto } from '@/modules/identity';
import {
  registerIdentity,
  SESSION_COOKIE_NAME,
  type IdentityModule,
} from '@/modules/identity/server';
import { requireDb } from '@/platform/db/client';
import { env, sessionSecret, smtpConfig } from '@/platform/env';

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
  return registerIdentity({
    db: requireDb(),
    sessionSecret: sessionSecret(),
    appUrl: env().APP_URL,
    ...(smtp ? { smtp } : {}),
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
