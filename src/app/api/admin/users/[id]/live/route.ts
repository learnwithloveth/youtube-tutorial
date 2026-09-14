import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { getUserDetail } from '@/server/users';

/**
 * Where one account is, right now.
 *
 * Feeds the live layer of the map on the console's account page. A route handler
 * rather than a Server Component because the map refreshes on a timer in the
 * browser, and a Server Component cannot re-render itself.
 *
 * ── Authorisation is re-derived here ──────────────────────────────────────────
 * The `(admin)` layout protects the page, not this URL. A route handler is public
 * to anyone who can type it, and this one returns a named person's live location —
 * so the check is repeated, and it answers 404 rather than 403 for a signed-in
 * customer, for the reason the rest of the console does.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') notFound();

  const detail = await getUserDetail(id);
  if (detail === null) notFound();

  return Response.json(
    {
      tabs: detail.liveTabs.map((tab) => ({
        visitorId: tab.visitorId,
        path: tab.path,
        activity: tab.activity,
        secondsOnPage: tab.secondsOnPage,
        location: tab.location,
      })),
      observedAt: new Date().toISOString(),
    },
    {
      status: 200,
      // Never cached, and never by a shared cache: this names a person and says
      // where they are.
      headers: { 'cache-control': 'no-store, private' },
    },
  );
}
