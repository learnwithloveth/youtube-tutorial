import { notFound } from 'next/navigation';

import type { TransactionKind, TransactionStatus } from '@/modules/ledger';
import { getCurrentUser } from '@/server/auth';
import { getTransactionFeed } from '@/server/transactions';

/**
 * One page of the platform-wide transaction feed.
 *
 * A route handler rather than a Server Component because the console fetches the
 * next page as the operator scrolls, and a Server Component cannot re-render
 * itself. The *first* page is still read on the server and handed to the client as
 * initial data — so the table arrives filled, and this endpoint is only ever
 * reached by a scroll or a filter change.
 *
 * ── Authorisation is re-derived here ──────────────────────────────────────────
 * The `(admin)` layout protects the page, not this URL. A route handler is public
 * to anyone who can type it, and this one returns every customer's payout address
 * and deposit reference — so the check is repeated, and it answers 404 rather than
 * 403 for a signed-in customer, for the reason the rest of the console does: a 403
 * confirms the endpoint exists.
 */

export const dynamic = 'force-dynamic';

const KINDS = new Set<string>(['deposit', 'withdrawal', 'all']);
const STATUSES = new Set<string>(['pending', 'approved', 'rejected', 'all']);

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') notFound();

  const params = new URL(request.url).searchParams;

  const rawLimit = Number(params.get('limit'));
  const kind = params.get('kind');
  const status = params.get('status');

  const feed = await getTransactionFeed({
    // `listTransactions` clamps the limit; passing `undefined` for anything
    // unparseable lets its default apply rather than encoding the number twice.
    limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined,
    cursor: params.get('cursor'),
    // An unrecognised filter falls back to "everything" rather than returning
    // nothing. A typo in a query string should widen the view, not silently empty
    // it — an operator seeing zero rows would read that as zero transactions.
    kind: kind !== null && KINDS.has(kind) ? (kind as TransactionKind | 'all') : 'all',
    status:
      status !== null && STATUSES.has(status) ? (status as TransactionStatus | 'all') : 'all',
  });

  return Response.json(feed, {
    status: 200,
    // Never cached, and never by a shared cache: this names people and says what
    // they are worth.
    headers: { 'cache-control': 'no-store, private' },
  });
}
