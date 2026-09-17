import { NextResponse, type NextRequest } from 'next/server';

import type { IdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { getCurrentUser, identity, SESSION_COOKIE } from '@/server/auth';
import { recordAndPush } from '@/server/push';
import { describeRequest } from '@/server/request-context';
import { sessionCookieOptions } from '@/server/session-cookie';
import type { UserId } from '@/shared/kernel/ids';

import { decodeTransaction, OAUTH_COOKIE } from '../_lib/transaction';

/**
 * Where Google sends the browser back.
 *
 * ── The order of the checks is the security of this route ─────────────────────
 * The transaction cookie is read and cleared first, so a code can never be replayed
 * against a second attempt. `state` is compared before anything is exchanged, which
 * is what stops an attacker handing a victim's browser their own authorization code
 * and silently signing that person into the attacker's account. Only then is the
 * code exchanged, and the id_token's `nonce` checked inside the adapter.
 *
 * ── Failures never say more than they have to ─────────────────────────────────
 * Every outcome lands back on a page with a short code in the query string, which
 * the page maps to fixed copy. Neither the provider's error text nor our own
 * exception message reaches the browser: one is somebody else's wording appearing
 * inside our interface, and the other is a description of our internals.
 */
export const dynamic = 'force-dynamic';

type FailureCode =
  | 'google-unavailable'
  | 'google-cancelled'
  | 'google-expired'
  | 'google-failed'
  | 'google-unverified'
  | 'google-linked-elsewhere'
  | 'google-already-connected'
  | 'account-disabled';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const transaction = decodeTransaction(request.cookies.get(OAUTH_COOKIE)?.value);
  const settingsPath = '/app/settings?tab=security';

  // Cleared on every path out of here, successful or not: it is good for exactly
  // one round trip.
  const finish = (location: string): NextResponse => {
    const response = NextResponse.redirect(new URL(location, request.url));
    response.cookies.delete({ name: OAUTH_COOKIE, path: '/api/auth/google' });
    return response;
  };

  const failWith = (code: FailureCode): NextResponse =>
    finish(
      transaction?.mode === 'link'
        ? `${settingsPath}&google=${code}`
        : `/login?error=${code}`,
    );

  const google = identity().google;
  if (google === null) return failWith('google-unavailable');

  // Google reports a refused consent screen this way. Not a failure of ours, and
  // the person knows what they did — they land back where they started.
  if (request.nextUrl.searchParams.get('error') !== null) {
    return failWith('google-cancelled');
  }

  if (transaction === null) return failWith('google-expired');

  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');

  if (state === null || state !== transaction.state) {
    logger.warn({ event: 'google_oauth_state_mismatch', module: 'identity' });
    return failWith('google-failed');
  }
  if (code === null || code === '') return failWith('google-failed');

  let profile;
  try {
    profile = await google.exchange({
      code,
      codeVerifier: transaction.codeVerifier,
      nonce: transaction.nonce,
    });
  } catch (error) {
    logger.error({ event: 'google_oauth_exchange_failed', module: 'identity' }, error);
    return failWith('google-failed');
  }

  if (transaction.mode === 'link') {
    const user = await getCurrentUser();
    // The session ended while they were away at Google. Linking needs an account to
    // link to, and this route will not guess which one.
    if (user === null) return finish('/login?next=/app/settings');

    const linked = await identity().connectGoogle({ userId: user.id, profile });
    if (!linked.ok) return failWith(codeFor(linked.error));

    logger.info({ event: 'google_connected', module: 'identity' });
    return finish(`${settingsPath}&google=connected`);
  }

  const context = await describeRequest();
  const result = await identity().signInWithGoogle({
    profile,
    userAgent: request.headers.get('user-agent'),
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  if (!result.ok) {
    logger.info({ event: 'google_signin_rejected', module: 'identity', reason: result.error._tag });
    return failWith(codeFor(result.error));
  }

  const response = finish(transaction.next);
  response.cookies.set(
    SESSION_COOKIE,
    result.value.sealed,
    sessionCookieOptions(new Date(result.value.expiresAt)),
  );

  try {
    await recordAndPush({
      userId: result.value.userId as UserId,
      kind: 'sign-in',
      detail: 'with Google',
      location: context.location,
      agent: context.agent,
      ipDigest: context.ipDigest,
    });
  } catch {
    // Best effort, like every other trail write: a sign-in that succeeded must not
    // become an error page because an audit insert timed out.
    logger.warn({ event: 'signin_trail_write_skipped', module: 'identity' });
  }

  logger.info({ event: 'google_signin', module: 'identity' });
  return response;
}

/** Domain outcomes the pages have copy for. Anything else is just "it failed". */
function codeFor(error: IdentityError): FailureCode {
  switch (error._tag) {
    case 'ProviderEmailUnverified':
      return 'google-unverified';
    case 'ProviderAccountLinkedElsewhere':
      return 'google-linked-elsewhere';
    case 'ProviderAlreadyConnected':
      return 'google-already-connected';
    case 'AccountDisabled':
      return 'account-disabled';
    default:
      return 'google-failed';
  }
}
