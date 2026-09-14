import { getCurrentUser } from '@/server/auth';
import { support } from '@/server/support';

/**
 * Mints the credential a browser needs to subscribe to its own conversation.
 *
 * ── This is the only place a Firebase identity is created ──────────────────────
 * Nobody signs in to Firebase. The caller proves who they are the way everything
 * else in this application does — a session cookie, read only through
 * `src/server/auth.ts` — and this hands back a short-lived token asserting that,
 * with a claim saying whether they are a customer or an operator.
 *
 * So there is no second authorisation system to keep in step with the first.
 * Firestore's rules are a lock on one door, and this route cuts the only key.
 *
 * ── Why a POST for something that reads nothing ────────────────────────────────
 * It creates a credential. A GET would be prefetchable by the router, cacheable by
 * anything in front of it, and reachable from a `<link rel=prefetch>` on a page the
 * user has not opened — none of which should mint an auth token.
 */

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) {
    return Response.json({ error: 'not-signed-in' }, { status: 401 });
  }

  const context = support();
  if (context === null) {
    // A supported configuration, not a fault: no Firebase project is set up. The
    // widget renders a plain "unavailable" state rather than an error.
    return Response.json({ error: 'support-unavailable' }, { status: 503 });
  }

  const role = user.role === 'admin' ? 'operator' : 'customer';
  const token = await context.dependencies.realtime.issueToken(user.id, role);

  return Response.json(
    { token, uid: user.id, role },
    {
      status: 200,
      // Never cached, by anything. This is a bearer credential for one person.
      headers: { 'cache-control': 'no-store, private' },
    },
  );
}
