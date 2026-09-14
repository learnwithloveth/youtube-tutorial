import type { Metadata } from 'next';

import { getTransactionFeed } from '@/server/transactions';

import { AdminPageHeader } from '../../_components/admin-ui';
import { ConsoleQueryProvider } from '../../_providers/query-provider';
import { TransactionFeed } from './_components/transaction-feed';

/**
 * Every transaction on the platform.
 *
 * ── Why this is not on the approvals screen ────────────────────────────────────
 * Approvals is a work queue: a short list of things waiting on a decision, worked
 * oldest-first and emptied. This is a history, read newest-first and never
 * emptied. Putting a scrolling archive under a queue would bury the four rows that
 * need acting on beneath four hundred that do not, and the queue's whole value is
 * that reaching the bottom of it means the work is done.
 *
 * ── The first page is read here, on the server ─────────────────────────────────
 * Server Components read; route handlers are for what happens after. So this page
 * reads page one directly through the facade — never by fetching its own
 * `/api/admin/transactions`, which would be this server making an HTTP request to
 * itself to get data it can already reach — and hands it to the client component
 * as initial data. The route handler is reached only by a scroll or a filter.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Transactions',
  robots: { index: false, follow: false },
};

/** Must match `FIRST_PAGE` in the feed, or the client refetches what it was given. */
const FIRST_PAGE = 5;

export default async function TransactionsPage() {
  const initial = await getTransactionFeed({ limit: FIRST_PAGE });

  return (
    <>
      <AdminPageHeader
        title="Transactions"
        description="Every deposit and withdrawal on the platform, newest first. Open one to see everything recorded about it, including the screenshot a customer filed with a deposit."
      />

      {/* The query cache is mounted here rather than in the console's layout, for
          the same reason `'use client'` goes on the smallest leaf that needs it:
          this is the only screen that pages in the browser, and every other admin
          route would otherwise download a cache it never reads. */}
      <ConsoleQueryProvider>
        <TransactionFeed initial={initial} />
      </ConsoleQueryProvider>
    </>
  );
}
