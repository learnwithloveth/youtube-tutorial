'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { PageHeader, Panel } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { TRANSACTIONS } from '../../_data/data';
import { dateTimeLabel, money, moneyExact } from '../../../_console/data/format';
import { formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import type { TxKind } from '../../_data/types';

const KINDS: (TxKind | 'all')[] = ['all', 'buy', 'sell', 'convert', 'deposit', 'withdrawal', 'reward', 'stake', 'unstake'];
const PAGE = 12;

const KIND_TONE: Record<TxKind, 'up' | 'down' | 'brand' | 'neutral'> = {
  buy: 'up', deposit: 'up', reward: 'up',
  sell: 'down', withdrawal: 'down',
  convert: 'brand', stake: 'brand', unstake: 'neutral',
};

export default function TransactionsPage() {

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<TxKind | 'all'>('all');
  const [page, setPage] = useState(0);
  const deferred = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    return TRANSACTIONS.filter((tx) => {
      const matchesKind = kind === 'all' || tx.kind === kind;
      const matchesQuery =
        !needle ||
        tx.symbol.toLowerCase().includes(needle) ||
        tx.kind.includes(needle) ||
        tx.reference.toLowerCase().includes(needle);
      return matchesKind && matchesQuery;
    });
  }, [deferred, kind]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE, current * PAGE + PAGE);

  const inflow = TRANSACTIONS.filter((t) => ['buy', 'deposit', 'reward'].includes(t.kind)).reduce((s, t) => s + t.value, 0);
  const outflow = TRANSACTIONS.filter((t) => ['sell', 'withdrawal'].includes(t.kind)).reduce((s, t) => s + t.value, 0);
  const fees = TRANSACTIONS.reduce((s, t) => s + t.fee, 0);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every movement on the account, exportable in eight jurisdictional formats."
        actions={
          <Button variant="outline" size="sm">
            <Download className="size-3.5" />
            Export
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Transactions" value={String(TRANSACTIONS.length)} delta={{ value: 'Last 90 days', direction: 'flat', period: '' }} />
        <StatTile label="Inflow" value={money(inflow)} delta={{ value: 'Buys, deposits, rewards', direction: 'up', period: '' }} />
        <StatTile label="Outflow" value={money(outflow)} delta={{ value: 'Sells and withdrawals', direction: 'down', period: '' }} upIsGood={false} />
        <StatTile label="Fees paid" value={money(fees)} delta={{ value: '0.08% blended', direction: 'flat', period: '' }} upIsGood={false} />
      </div>

      <Panel>
        {/* One filter row above everything it scopes. */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative w-full max-w-xs">
            <span className="sr-only">Search transactions</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search asset, type or reference"
              className="h-9 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
            />
          </label>
          <div className="mask-x -mx-1 overflow-x-auto pb-1">
            <div className="flex gap-1.5 px-1">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setPage(0);
                  }}
                  aria-pressed={kind === k}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-3 py-1 text-2xs capitalize transition-colors',
                    kind === k
                      ? 'border-brand-soft/60 bg-brand/15 text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <TableShell caption="Transaction history" minWidth="52rem">
          <thead>
            <tr>
              <Th>Type</Th><Th>Asset</Th>
              <Th numeric>Quantity</Th><Th numeric>Value</Th><Th numeric>Fee</Th>
              <Th>Status</Th>
              <Th className="hidden lg:table-cell">Reference</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>No transactions match those filters.</EmptyRow>
            ) : (
              rows.map((tx) => (
                <Tr key={tx.id}>
                  <Td>
                    <Badge tone={KIND_TONE[tx.kind]} className="capitalize">{tx.kind}</Badge>
                  </Td>
                  <Td className="font-medium text-fg">{tx.symbol}</Td>
                  <Td numeric>{formatQuantity(tx.quantity, 4)}</Td>
                  <Td numeric className="font-medium text-fg">{moneyExact(tx.value)}</Td>
                  <Td numeric>{moneyExact(tx.fee)}</Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs',
                        tx.status === 'completed' ? 'text-up' : tx.status === 'pending' ? 'text-warn' : 'text-down',
                      )}
                    >
                      <span aria-hidden className="size-1.5 rounded-full bg-current" />
                      {tx.status}
                    </span>
                  </Td>
                  <Td className="hidden font-mono text-2xs lg:table-cell">{tx.reference}</Td>
                  <Td className="whitespace-nowrap">{dateTimeLabel(tx.timestamp)}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableShell>

        <div className="mt-4 flex items-center justify-between gap-4 text-xs">
          <p className="text-fg-subtle">
            Showing {rows.length} of {filtered.length} transactions
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className="rounded-sm border border-line px-3 py-1.5 text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              Previous
            </button>
            <span className="tabular-nums text-fg-subtle">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={current >= pages - 1}
              className="rounded-sm border border-line px-3 py-1.5 text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}
