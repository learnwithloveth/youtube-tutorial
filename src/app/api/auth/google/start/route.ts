import { NextResponse, type NextRequest } from 'next/server';

import { logger } from '@/platform/observability/logger';
import { identity } from '@/server/auth';

import {
  codeChallengeFor,
  cookieOptionsFor,
  createTransaction,
  encodeTransaction,
  safeNext,
  OAUTH_COOKIE,
  type OAuthMode,
} from '../_lib/transaction';

/**
 * Starts a sign-in with Google.
 *
 * ── A route handler, not a Server Action ──────────────────────────────────────
 * The end of this is a redirect to another origin carrying values the browser must
 * keep, which is a navigation rather than a mutation of our own state. It writes no
 * account data: everything it creates is one ten-minute cookie describing the trip,
 * and the account decisions happen in the callback.
 *
 * ── Unconfigured is a state, not a crash ──────────────────────────────────────
 * With no Google credentials the button that points here is not rendered at all, so
 * arriving is either a stale tab or somebody typing the URL. It lands back on the
 * login page saying so, rather than throwing a 500 for a deployment choice.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest): NextResponse {
  const google = identity().google;
  if (google === null) {
    return NextResponse.redirect(new URL('/login?error=google-unavailable', request.url));
  }

  const mode: OAuthMode =
    request.nextUrl.searchParams.get('mode') === 'link' ? 'link' : 'sign-in';
  const transaction = createTransaction(mode, safeNext(request.nextUrl.searchParams.get('next')));

  const destination = google.authorizationUrl({
    state: transaction.state,
    nonce: transaction.nonce,
    codeChallenge: codeChallengeFor(transaction),
  });

  logger.info({ event: 'google_oauth_started', module: 'identity', mode });

  const response = NextResponse.redirect(destination);
  // Set on the response rather than through `cookies()`: this response is a
  // redirect built here, and attaching the cookie to it leaves no doubt about
  // which response carries it.
  response.cookies.set(OAUTH_COOKIE, encodeTransaction(transaction), cookieOptionsFor());
  return response;
}
