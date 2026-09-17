import { getAdminFeed } from '@/server/admin-alerts';
import { getCurrentUser } from '@/server/auth';

/**
 * The console's feed of customer activity, for the bell and the alerts every admin
 * page shows.
 *
 * Polled by the console rather than pushed to it: a serverless deployment cannot
 * hold a connection open, and this changes on the scale of seconds, not frames. A
 * push notification that reaches the operator's browser makes the page ask at once
 * instead of waiting for the next poll — see `admin-notifications.tsx`.
 *
 * 404 for anybody who is not an operator, as the console's pages answer: a 403
 * would confirm there is something here.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') return new Response(null, { status: 404 });

  const feed = await getAdminFeed(20);
  return Response.json(feed, { headers: { 'cache-control': 'no-store, private' } });
}
