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
import { shortenHash } from '@/modules/ledger';
import { requireUser } from '@/server/auth';
import { getOwnTransactions, getStatementFor, withdrawableAssets } from '@/server/ledger';
import { getInstruments } from '@/server/market-data';
import { shortenDecimalString } from '@/shared/kernel';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { ReceiptLink } from '../_components/receipt-link';
import { TxHash } from '../_components/tx-hash';
import { networkLabelFor, networkLabels } from '../_lib/network-label';
import { CUSTOMER_STATUS } from '../_lib/record-status';

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

/**
 * How many deposit and withdrawal records to list above the statement.
 *
 * Deliberately short and unpaged. This panel answers "where is the thing I asked
 * for, and can I print it" — a question about recent requests. The full history
 * is the statement below, which is paged.
 */
const RECORD_LIMIT = 10;

const KIND_LABEL: Record<TransferKind, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  'withdrawal-fee': 'Network fee',
  adjustment: 'Adjustment',
  'demo-credit': 'Deposit',
};

const KIND_TONE: Record<TransferKind, 'up' | 'down' | 'brand' | 'neutral'> = {
  deposit: 'up',
  withdrawal: 'down',
  'withdrawal-fee': 'neutral',
  adjustment: 'brand',
  // Not `up`. Green is what a deposit gets, and reading the two as the same
  // thing at a glance is exactly the confusion the separate kind exists to stop.
  'demo-credit': 'brand',
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

  const labels = networkLabels(assets);
  const page = Math.max(Number(params.page ?? '1') || 1, 1);

  // Two reads, and they are not the same set. The statement is what moved; the
  // records are the requests behind it — including a refused deposit and a
  // withdrawal still on hold, neither of which ever produced an entry. A receipt
  // is issued against a record, which is why the links live on that panel.
  const [statement, records] = await Promise.all([
    getStatementFor(user.id as UserId, {
      asset,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getOwnTransactions(user.id as UserId, RECORD_LIMIT),
  ]);

  // Logos and brand hues, for the coin beside each movement. Editorial data from
  // market-data, which is where a glyph belongs — the ledger has never heard of one.
  const instruments = await getInstruments();
  const marks = new Map(instruments.map((i) => [i.symbol, { glyph: i.glyph, hue: i.hue }]));

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
            <span className="text-fg-muted">This is a failed query, not an empty history.</span>
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

      {records.transactions.length > 0 ? (
        <Panel className="mb-4">
          <PanelHeader
            title="Deposits and withdrawals"
            subtitle="Your requests and where each one stands. Open one to print its receipt."
          />
          <ul className="divide-y divide-line/60">
            {records.transactions.map((record) => {
              const state = CUSTOMER_STATUS[record.status];
              const detail =
                record.status === 'rejected'
                  ? record.reason
                  : (record.confirmingNote ?? state.hint);

              return (
                <li key={record.id} className="flex flex-wrap items-center gap-3 py-3">
                  {/* The coin and its chain, for the reason the statement below
                      carries one: on a list where half the rows are USDT, which
                      network a request is on is what the reader came to check. */}
                  <AssetMark
                    symbol={record.asset}
                    glyph={marks.get(record.asset)?.glyph ?? record.asset.slice(0, 1)}
                    hue={marks.get(record.asset)?.hue ?? 'var(--chart-1)'}
                    network={record.network}
                    size="xs"
                  />
                  <span className="min-w-0">
                    <span data-numeric className="block font-mono text-sm text-fg">
                      {shortenDecimalString(record.settledAmount ?? record.amount)} {record.asset}
                    </span>
                    <span className="block text-2xs text-fg-subtle">
                      {record.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} ·{' '}
                      {networkLabelFor(labels, record.asset, record.network)} ·{' '}
                      {formatDate(record.occurredAt)}
                    </span>
                    {/* Under the badge rather than inside it. "Pending" is the word
                        that has to be readable at a glance; *why* it is pending is
                        a sentence, and a sentence does not fit in a badge. The
                        operator's own note wins over the generic hint when there
                        is one — they know what this particular wait is about. */}
                    {detail === null ? null : (
                      <span className="mt-0.5 block text-2xs text-fg-muted">{detail}</span>
                    )}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <ReceiptLink
                      kind={record.kind}
                      recordId={record.recordId}
                      status={record.status}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
            A receipt records one movement on your account. It is not a tax invoice — nothing in
            this system issues one.
          </p>
        </Panel>
      ) : null}

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

        <TableShell caption="Account movements" minWidth="60rem">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Asset</Th>
              <Th>Network</Th>
              <Th>Transaction</Th>
              <Th numeric>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.length === 0 ? (
              <EmptyRow colSpan={6}>
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
                    <span className="flex items-center gap-2">
                      {/* The network is passed, so USDT draws the chain's badge on
                          the coin: Tether-on-Tron and Tether-on-Ethereum are the
                          same balance and very much not the same transaction. */}
                      <AssetMark
                        symbol={line.asset}
                        glyph={marks.get(line.asset)?.glyph ?? line.asset.slice(0, 1)}
                        hue={marks.get(line.asset)?.hue ?? 'var(--chart-1)'}
                        network={line.network}
                        size="xs"
                      />
                      <span className="text-xs text-fg">{line.asset}</span>
                    </span>
                  </Td>
                  <Td>
                    {line.network === null ? (
                      // Never a dash standing in for a chain. A withdrawal fee is
                      // an internal movement between two platform accounts and
                      // crossed nothing, and saying so beats implying it did.
                      <span className="text-2xs text-fg-subtle">Internal</span>
                    ) : (
                      <span className="text-xs text-fg-muted">
                        {networkLabelFor(labels, line.asset, line.network)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {line.txHash === null ? (
                      /* Rare now that every movement is given a reference when it
                         is written. What reaches this branch is a row stored before
                         that was true — `pnpm ledger:backfill-hashes` fills them —
                         so the copy describes the row rather than a rule about the
                         system, which is all that can honestly be said about it. */
                      <span
                        title="No transaction reference was recorded for this movement."
                        className="text-2xs text-fg-subtle"
                      >
                        Not recorded
                      </span>
                    ) : (
                      <TxHash value={line.txHash} short={shortenHash(line.txHash)} />
                    )}
                  </Td>
                  <Td numeric>
                    <span
                      className={cn('font-mono', line.direction === 'in' ? 'text-up' : 'text-fg')}
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
      </Panel>
    </>
  );
}

function AssetFilter({ label, href, active }: { label: string; href: string; active: boolean }) {
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
