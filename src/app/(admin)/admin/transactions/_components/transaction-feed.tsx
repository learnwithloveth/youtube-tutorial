'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ImageIcon,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';

import type { TransactionDto, TransactionKind, TransactionStatus } from '@/modules/ledger';
import { maskDestination } from '@/modules/ledger';
import type { TransactionAccountDto, TransactionFeedDto } from '@/server/transactions';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';

import { TransactionDetail } from './transaction-detail';

/**
 * Every transaction on the platform, paged as the operator scrolls.
 *
 * ── The first page comes from the server ───────────────────────────────────────
 * `initial` is read by the page's Server Component and seeded into the cache, so
 * the table arrives filled rather than flashing a spinner and then fetching what
 * the server already had in hand. The route handler is only ever reached by a
 * scroll or a filter change — which is also why it exists at all: a Server
 * Component cannot re-render itself in response to a scroll.
 *
 * ── Why five, then twenty ──────────────────────────────────────────────────────
 * The opening view is short on purpose: an operator arriving here is usually
 * checking the last few movements, and five rows put the filters, the totals and
 * the newest transaction on one screen without scrolling. Once they *are*
 * scrolling, five-row pages would mean a request every flick of the wheel, so the
 * pages after the first are twenty.
 */

const FIRST_PAGE = 5;
const NEXT_PAGE = 20;

type KindFilter = TransactionKind | 'all';
type StatusFilter = TransactionStatus | 'all';

const KIND_OPTIONS: readonly { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
];

const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_TONE = {
  pending: 'warn',
  approved: 'up',
  rejected: 'down',
} as const;

export function TransactionFeed({ initial }: { initial: TransactionFeedDto }) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    // The filters are part of the key, not arguments to a refetch. Changing one
    // starts a separate cached feed rather than mutating this one — which is what
    // makes going back to "All" instant instead of a reload from the top.
    queryKey: ['admin', 'transactions', { kind, status }] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<TransactionFeedDto> => {
      const params = new URLSearchParams({
        limit: String(pageParam === null ? FIRST_PAGE : NEXT_PAGE),
        kind,
        status,
      });
      if (pageParam !== null) params.set('cursor', pageParam);

      const response = await fetch(`/api/admin/transactions?${params}`, {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Feed responded ${response.status}`);
      return (await response.json()) as TransactionFeedDto;
    },
    getNextPageParam: (last) => last.nextCursor,
    // Only the unfiltered feed matches what the server rendered. Seeding a filtered
    // view with it would show deposits under "Withdrawals" until the fetch landed.
    initialData:
      kind === 'all' && status === 'all'
        ? { pages: [initial], pageParams: [null] }
        : undefined,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isError, refetch, isFetching } =
    query;

  const pages = useMemo(() => data?.pages ?? [], [data]);

  const transactions = useMemo(
    () => pages.flatMap((page) => page.transactions),
    [pages],
  );

  /** Later pages win: an account renamed between requests reads the newer value. */
  const accounts = useMemo(
    () =>
      pages.reduce<Record<string, TransactionAccountDto>>(
        (merged, page) => Object.assign(merged, page.accounts),
        {},
      ),
    [pages],
  );

  const degraded = pages.some((page) => page.degraded);
  const selected = transactions.find((transaction) => transaction.id === selectedId) ?? null;

  // ── Scroll-triggered paging ────────────────────────────────────────────────
  // An IntersectionObserver on a sentinel below the last row, rather than a scroll
  // listener: a scroll handler fires on every frame of a flick and has to measure
  // the document to decide anything, which is layout work on the main thread during
  // the one interaction where dropped frames are visible.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      // Fires before the sentinel is on screen, so the next page is usually already
      // there by the time the operator reaches the bottom.
      { rootMargin: '400px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            label="Kind"
            options={KIND_OPTIONS}
            value={kind}
            onChange={(next) => {
              setKind(next);
              setSelectedId(null);
            }}
          />
          <FilterGroup
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(next) => {
              setStatus(next);
              setSelectedId(null);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40"
        >
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {degraded || isError ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            Transactions could not be read. This is an empty page, not an empty
            ledger — nothing below is a statement about what has happened.
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-surface">
            <tr className="text-2xs uppercase tracking-[0.12em] text-fg-subtle">
              <Th className="pl-4">Transaction</Th>
              <Th>Account</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
              <Th className="pr-4">When</Th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <Row
                key={transaction.id}
                transaction={transaction}
                account={accounts[transaction.userId]}
                selected={transaction.id === selectedId}
                onSelect={() => setSelectedId(transaction.id)}
              />
            ))}

            {transactions.length === 0 && !isFetching ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-xs text-fg-subtle">
                  {degraded
                    ? 'Nothing could be read.'
                    : kind === 'all' && status === 'all'
                      ? 'No transactions yet.'
                      : 'No transactions match this filter.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* The sentinel sits outside the table: a `<div>` between `<tr>`s is invalid
          markup that browsers hoist out of the table, which would put the observer
          somewhere other than where it appears to be. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      <div className="flex items-center justify-center py-4 text-2xs text-fg-subtle">
        {isFetchingNextPage ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            Loading more
          </span>
        ) : hasNextPage ? (
          // A button as well as the observer. Scroll-triggered paging is invisible
          // to a keyboard, and an operator who tabs to the end of the table needs a
          // way to reach the next page that does not involve a mouse wheel.
          <button
            type="button"
            onClick={loadMore}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Load more
          </button>
        ) : transactions.length > 0 ? (
          <span>
            {transactions.length} transaction{transactions.length === 1 ? '' : 's'} · end of
            the feed
          </span>
        ) : null}
      </div>

      <TransactionDetail
        transaction={selected}
        account={selected ? accounts[selected.userId] : undefined}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5 font-medium', className)}>{children}</th>;
}

function Row({
  transaction,
  account,
  selected,
  onSelect,
}: {
  transaction: TransactionDto;
  account: TransactionAccountDto | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const deposit = transaction.kind === 'deposit';
  const Icon = deposit ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <tr
      // Clicking anywhere on the row opens it, and the *button* in the first cell
      // is still the accessible control. Both, not either: a `<tr onClick>` alone
      // is unreachable by keyboard and announces nothing, while a button alone
      // makes four of the five columns dead space — which is what they were.
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-t border-line transition-colors hover:bg-surface',
        selected && 'bg-surface',
      )}
    >
      <td className="px-3 py-2.5 pl-4">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2.5 text-left focus-visible:outline-none"
        >
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-md border',
              deposit ? 'border-up/35 bg-up/10 text-up' : 'border-down/35 bg-down/10 text-down',
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium text-fg">
              {deposit ? 'Deposit' : 'Withdrawal'}
              <span className="font-mono text-2xs text-fg-subtle">{transaction.asset}</span>
              {transaction.hasProof ? (
                <ImageIcon className="size-3 text-fg-subtle" aria-label="Has a screenshot" />
              ) : null}
            </span>
            <span className="block truncate font-mono text-2xs text-fg-subtle">
              {transaction.network}
              {transaction.destination
                ? ` · ${maskDestination(transaction.destination)}`
                : transaction.reference
                  ? ` · ${maskDestination(transaction.reference)}`
                  : ''}
            </span>
          </span>
        </button>
      </td>

      <td className="px-3 py-2.5">
        {/* The id, not a placeholder, when the directory could not answer: an
            operator can still act on an id, and "Unknown" cannot be looked up. */}
        <span className="block truncate text-fg-muted">{account?.email ?? '—'}</span>
        <span className="block truncate font-mono text-2xs text-fg-subtle">
          {transaction.userId}
        </span>
      </td>

      <td className="px-3 py-2.5 text-right">
        <span data-numeric className="block text-fg">
          {transaction.direction === 'out' ? '−' : '+'}
          {transaction.amount} {transaction.asset}
        </span>
        {transaction.settledAmount !== null &&
        transaction.settledAmount !== transaction.amount ? (
          <span data-numeric className="block text-2xs text-warn">
            credited {transaction.settledAmount}
          </span>
        ) : null}
      </td>

      <td className="px-3 py-2.5">
        <Badge tone={STATUS_TONE[transaction.status]}>{transaction.status}</Badge>
      </td>

      <td className="px-3 py-2.5 pr-4 text-fg-subtle">{formatDate(transaction.occurredAt)}</td>
    </tr>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-line p-0.5">
      <span className="sr-only">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            'rounded px-2.5 py-1 text-xs transition-colors',
            option.value === value
              ? 'bg-surface-strong text-fg'
              : 'text-fg-subtle hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
