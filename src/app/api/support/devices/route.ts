import { cookies } from 'next/headers';

import { logger } from '@/platform/observability/logger';
import { getCurrentUser } from '@/server/auth';
import { PUSH_DEVICE_COOKIE, pushDeviceCookieOptions } from '@/server/push';
import { support } from '@/server/support';

/**
 * Registers or forgets one browser's push token.
 *
 * Under `support/` because support was the first thing to push; the registration
 * now carries every notification an account receives, not only chat.
 *
 * ── The role is stamped at registration, from the session ──────────────────────
 * A device's audience — operator or customer — is decided here and stored beside
 * the token, because a notification is later addressed to a *group*. Taking the
 * role from the request would let any signed-in customer enrol themselves for
 * every operator alert on the platform, which is a feed of other people's support
 * threads and the previews of what they wrote.
 *
 * ── DELETE matters as much as POST ────────────────────────────────────────────
 * A token outlives the session that registered it. Signing out without unregistering
 * leaves a shared machine notifying the next person about conversations that are
 * not theirs — so registering leaves the token in a cookie, and the sign-out action
 * reads it back and forgets it. See `server/push.ts`.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, private' };

interface Body {
  token?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) return Response.json({ error: 'not-signed-in' }, { status: 401 });

  const context = support();
  if (context === null) {
    return Response.json({ error: 'support-unavailable' }, { status: 503 });
  }

  const token = await readToken(request);
  if (token === null) return Response.json({ error: 'A token is required.' }, { status: 400 });

  let outcome;
  try {
    outcome = await context.dependencies.push.register({
      token,
      userId: user.id,
      role: user.role === 'admin' ? 'operator' : 'customer',
    });
  } catch (error) {
    // Answered as a failure, not swallowed. The page used to be told nothing either
    // way, so a switch could read "on" for a device that was never saved.
    logger.warn({ event: 'push_device_register_failed', module: 'support' }, error);
    return Response.json({ error: 'register-failed' }, { status: 502, headers: NO_STORE });
  }

  // 410: FCM no longer knows this token. Nothing was saved; the page throws its
  // subscription away and registers a fresh one.
  if (outcome === 'stale-token') {
    return Response.json({ error: 'stale-token' }, { status: 410, headers: NO_STORE });
  }

  (await cookies()).set(PUSH_DEVICE_COOKIE, token, pushDeviceCookieOptions());
  return new Response(null, { status: 204, headers: NO_STORE });
}

export async function DELETE(request: Request): Promise<Response> {
  const store = await cookies();

  // The token the page sent, and the one this browser last registered — usually the
  // same, and both forgotten when not. The cookie is also all a page has to offer
  // when it never loaded Firebase, which is how a browser that changed hands
  // unregisters the previous account without asking the push service for anything.
  const tokens = new Set(
    [await readToken(request), store.get(PUSH_DEVICE_COOKIE)?.value ?? null].filter(
      (token): token is string => token !== null && isToken(token),
    ),
  );
  store.delete(PUSH_DEVICE_COOKIE);

  const context = support();
  if (context === null || tokens.size === 0) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  // Unauthenticated deletion is allowed on purpose: the caller already holds the
  // token, which is the only thing the row is keyed by, and the operation only
  // ever removes their own device. Requiring a session would mean a token can
  // outlive its owner's ability to revoke it.
  try {
    await Promise.all([...tokens].map((token) => context.dependencies.push.forget(token)));
  } catch (error) {
    logger.warn({ event: 'push_device_forget_failed', module: 'support' }, error);
    return Response.json({ error: 'forget-failed' }, { status: 502, headers: NO_STORE });
  }

  return new Response(null, { status: 204, headers: NO_STORE });
}

/**
 * An FCM token's shape, loosely.
 *
 * It becomes a Firestore document id, where a `/` is a path separator and would
 * throw — so anything outside the characters FCM actually issues is refused here,
 * as a bad request, rather than as a server error further down.
 */
function isToken(value: string): boolean {
  return /^[\w:-]{32,4096}$/.test(value);
}

async function readToken(request: Request): Promise<string | null> {
  try {
    const payload = (await request.json()) as Body;
    return typeof payload.token === 'string' && isToken(payload.token) ? payload.token : null;
  } catch {
    return null;
  }
}
