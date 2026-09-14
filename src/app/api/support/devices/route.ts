import { getCurrentUser } from '@/server/auth';
import { support } from '@/server/support';

/**
 * Registers or forgets one browser's push token.
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
 * not theirs, so the sign-out path calls this.
 */

export const dynamic = 'force-dynamic';

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

  await context.dependencies.push.register({
    token,
    userId: user.id,
    role: user.role === 'admin' ? 'operator' : 'customer',
  });

  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store, private' } });
}

export async function DELETE(request: Request): Promise<Response> {
  const context = support();
  if (context === null) return new Response(null, { status: 204 });

  const token = await readToken(request);
  // Unauthenticated deletion is allowed on purpose: the caller already holds the
  // token, which is the only thing the row is keyed by, and the operation only
  // ever removes their own device. Requiring a session would mean a token can
  // outlive its owner's ability to revoke it.
  if (token !== null) await context.dependencies.push.forget(token);

  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store, private' } });
}

async function readToken(request: Request): Promise<string | null> {
  try {
    const payload = (await request.json()) as Body;
    return typeof payload.token === 'string' && payload.token.length > 0 ? payload.token : null;
  } catch {
    return null;
  }
}
