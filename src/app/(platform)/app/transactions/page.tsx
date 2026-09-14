import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';

import type { TransferKind } from '@/modules/ledger';
import { requireUser } from '@/server/auth';
import { getStatementFor, withdrawableAssets } from '@/server/ledger';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';

/**
 * The statement: every movement on this account, newest first.
 *
 * ── It is the ledger's entries, not a separate record ──────────────────────────
 * Each line is one `ledger.entries` row joined to the transfer that caused it. The
 * entries are the record of truth and the balance is a materialised view of them,
 * so a statement read from anything else would be a second opinion about what
 * happened — and the two would eventually disagree.
 *
 * ── Filtering is in the URL ────────────────────────────────────────────────────
 * Which keeps the page a Server Component: rows are queried on the server, a
 * filtered view is a shareable link, and the statement never ships to the browser
 * as JSON.
 *
 * ── What it replaced ───────────────────────────────────────────────────────────
 * A fixture array of buys, sells, converts, stakes and rewards. Those kinds are
 * gone rather than reimplemented: this platform has no trading engine and no
 * staking context, so a "buy" line would be describing something that never
 * happened. What remains is what the ledger can actually attest to — deposits,
 * withdrawals and the fees on them.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Transactions',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

const KIND_LABEL: Record<TransferKind, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  'withdrawal-fee': 'Network fee',
  adjustment: 'Adjustment',
};

const KIND_TONE: Record<TransferKind, 'up' | 'down' | 'brand' | 'neutral'> = {
  deposit: 'up',
  withdrawal: 'down',
  'withdrawal-fee': 'neutral',
  adjustment: 'brand',
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; page?: string }>;
}) {
  // Next 16: `searchParams` is a Promise, and reading it is what makes the route
  // dynamic — which a statement has to be.
  const params = await searchParams;
  const user = await requireUser('/app/transactions');

  const assets = withdrawableAssets();
  const asset = assets.find((candidate) => candidate.code === params.asset)?.code;
  const page = Math.max(Number(params.page ?? '1') || 1, 1);

  const statement = await getStatementFor(user.id as UserId, {
    asset,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const pages = Math.max(Math.ceil(statement.total / PAGE_SIZE), 1);
  const incoming = statement.lines.filter((line) => line.direction === 'in').length;

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every movement on your account, taken straight from the ledger that holds your balance."
      />

      {statement.degraded ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-sm text-fg">
            Your statement could not be loaded.{' '}
            <span className="text-fg-muted">
              This is a failed query, not an empty history.
            </span>
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Movements"
          value={String(statement.total)}
          delta={{
            value: asset ? `filtered to ${asset}` : 'across all assets',
            direction: 'flat',
            period: '',
          }}
          icon={<Receipt className="size-4" />}
        />
        <StatTile
          label="Incoming on this page"
          value={String(incoming)}
          delta={{ value: 'credits', direction: 'flat', period: '' }}
        />
        <StatTile
          label="Outgoing on this page"
          value={String(statement.lines.length - incoming)}
          delta={{ value: 'debits', direction: 'flat', period: '' }}
          upIsGood={false}
        />
      </div>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="size-3.5 text-fg-subtle" />
          <AssetFilter label="All" href="/app/transactions" active={asset === undefined} />
          {assets.map((option) => (
            <AssetFilter
              key={option.code}
              label={option.code}
              href={`/app/transactions?asset=${option.code}`}
              active={asset === option.code}
            />
          ))}
        </div>

        <TableShell caption="Account movements" minWidth="48rem">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Reference</Th>
              <Th numeric>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.length === 0 ? (
              <EmptyRow colSpan={4}>
                {statement.degraded
                  ? 'Your statement could not be read.'
                  : asset
                    ? `No ${asset} movements yet.`
                    : 'Nothing has moved on your account yet. Deposits and withdrawals appear here.'}
              </EmptyRow>
            ) : (
              statement.lines.map((line) => (
                <Tr key={line.id}>
                  <Td>{formatDate(line.occurredAt)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {line.direction === 'in' ? (
                        <ArrowDownLeft className="size-3.5 text-up" />
                      ) : (
                        <ArrowUpRight className="size-3.5 text-down" />
                      )}
                      <Badge tone={KIND_TONE[line.kind]}>{KIND_LABEL[line.kind]}</Badge>
                    </span>
                  </Td>
                  <Td>
                    <span className="block max-w-88 truncate font-mono text-xs text-fg-subtle">
                      {line.reference}
                    </span>
                  </Td>
                  <Td numeric>
                    <span
                      className={cn(
                        'font-mono',
                        line.direction === 'in' ? 'text-up' : 'text-fg',
                      )}
                    >
                      {/* The sign is already on the value — it is the ledger's own
                          signed delta, not a formatting decision made here. */}
                      {line.delta} {line.asset}
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableShell>

        {pages > 1 ? (
          <nav
            aria-label="Statement pages"
            className="mt-4 flex items-center justify-between text-xs text-fg-subtle"
          >
            <span>
              Page {page} of {pages}
            </span>
            <span className="flex gap-3">
              <PageLink asset={asset} page={page - 1} disabled={page <= 1}>
                Previous
              </PageLink>
              <PageLink asset={asset} page={page + 1} disabled={page >= pages}>
                Next
              </PageLink>
            </span>
          </nav>
        ) : null}

        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
          Amounts are exact and shown in the asset that moved. There is no dollar
          column because a historical movement needs the price it had at the time,
          which is not something this statement can reconstruct from today&rsquo;s
          market without being wrong.
        </p>
      </Panel>
    </>
  );
}

function AssetFilter({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-surface-strong text-fg' : 'text-fg-muted hover:bg-surface hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
}

/** Anchors, not buttons: paging is navigation and needs no JavaScript to work. */
function PageLink({
  asset,
  page,
  disabled,
  children,
}: {
  asset: string | undefined;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="opacity-40">{children}</span>;

  const query = new URLSearchParams();
  if (asset) query.set('asset', asset);
  if (page > 1) query.set('page', String(page));

  return (
    <Link href={`/app/transactions?${query.toString()}`} className="hover:text-fg">
      {children}
    </Link>
  );
}
