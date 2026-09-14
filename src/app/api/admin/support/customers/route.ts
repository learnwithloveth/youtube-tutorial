import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { describeSupportCustomers } from '@/server/support';

/**
 * Who the conversations in the console belong to, and where they are right now.
 *
 * ── Why the console asks again after it has rendered ───────────────────────────
 * Two things go out of date at different speeds. The *account* behind a
 * conversation never changes, but Firestore pushes threads from customers the
 * first render had never heard of — so an id with no name appears. The customer's
 * *presence* — online, idle, and which page they are reading while they wait —
 * goes stale within a minute by design, because that is what a heartbeat is.
 *
 * Both are answered by the same Postgres join, so there is one endpoint. It is a
 * poll rather than a listener because that is what presence already is: the
 * underlying signal is a heartbeat every twenty seconds, and a socket would carry
 * the same information no faster.
 *
 * ── Operators only ────────────────────────────────────────────────────────────
 * This names customers and says where they are. The console's layout protects the
 * page, not this URL, so the role is re-derived and a signed-in customer gets 404.
 */

export const dynamic = 'force-dynamic';

/** Enough for the inbox the console actually renders, and a hard stop on abuse. */
const MAX_IDS = 60;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') notFound();

  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return Response.json({ customers: {} }, { headers: { 'cache-control': 'no-store, private' } });
  }

  return Response.json(
    { customers: await describeSupportCustomers(ids), observedAt: new Date().toISOString() },
    {
      status: 200,
      // Never cached, and never by a shared cache: this names people and says
      // where they are.
      headers: { 'cache-control': 'no-store, private' },
    },
  );
}
