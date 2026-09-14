import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { getLiveActivity } from '@/server/presence';

/**
 * The live-activity snapshot, for the console's polling board.
 *
 * ── Why a route handler for a read ─────────────────────────────────────────────
 * The rule is that Server Components read and route handlers write, and this is the
 * exception it allows for: the board refreshes every few seconds *in the browser*,
 * and a Server Component cannot re-render itself on a timer. The page still renders
 * its first paint on the server — it does not fetch this — so the read path the
 * rule protects is intact. This exists only to answer the refresh.
 *
 * ── Authorisation is re-derived here ───────────────────────────────────────────
 * The `(admin)` layout's `requireAdmin` protects the *page*. It protects nothing
 * here: a route handler is a public URL that anyone can request directly, and the
 * fact that the only UI which calls it sits behind a guarded layout is not a
 * control. So the check is repeated, and it is the same check — 404 rather than
 * 403, because telling a customer this endpoint exists and they may not have it
 * confirms the URL is real.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') notFound();

  const limit = Number(new URL(request.url).searchParams.get('limit') ?? '');

  const snapshot = await getLiveActivity(
    Number.isInteger(limit) && limit > 0 ? { limit } : {},
  );

  return Response.json(snapshot, {
    status: 200,
    // Never cached, and never by a shared cache. The payload is scoped to an
    // operator and describes named accounts; a CDN holding it for sixty seconds
    // would be serving one operator's board to whoever asked next.
    headers: { 'cache-control': 'no-store, private' },
  });
}
