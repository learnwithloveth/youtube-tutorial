'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { getCurrentUser, revokeAllSessions, SESSION_COOKIE } from '@/server/auth';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

/**
 * Ends every session on the account.
 *
 * ── It signs the caller out too, deliberately ──────────────────────────────────
 * Somebody who believes their account is compromised should not have to work out
 * which device they are currently on, and the session left alive would be the one
 * that might not be theirs. So all of them go and the caller lands on the login
 * page — which is also the clearest possible confirmation that it worked.
 *
 * A Server Action rather than a link, because this is a mutation: a GET that ends
 * every session on an account can be triggered by any `<img>` tag on any site.
 */
export async function revokeAllSessionsAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const revoked = await revokeAllSessions();

  const request = await describeRequest();
  await recordActivity({
    userId: user.id as UserId,
    kind: 'sign-out',
    detail: `signed out of ${revoked} ${revoked === 1 ? 'session' : 'sessions'}`,
    location: request.location,
    agent: request.agent,
    ipDigest: request.ipDigest,
  });

  logger.info({ event: 'sessions_revoked', module: 'identity', revoked });

  // The rows are already revoked, so the cookie is inert — clearing it only saves
  // the next request a pointless lookup.
  (await cookies()).delete(SESSION_COOKIE);

  redirect('/login?signedout=1');
}
