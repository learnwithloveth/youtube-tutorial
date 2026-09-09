'use client';

import { ArrowUpDown, Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';

import { MARKET_CATEGORIES, type MarketDto } from '@/modules/market-data';
import { cn } from '@/shared/lib/cn';
import { compareNullableDecimals } from '@/shared/lib/compare';
import { formatAge, formatCompact, formatPercent, formatPrice } from '@/shared/lib/format';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Card } from '@/shared/ui/primitives/card';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';

/**
 * The market table.
 *
 * Interactive — search, category filter, column sort — so a Client Component,
 * but it never fetches. Rows arrive from the server already priced, which means
 * the table is filled in on first paint and the filtering happens on data that
 * is already in memory.
 *
 * Two things changed from the design. Prices no longer jitter on a 1.5-second
 * interval, because that movement was generated rather than observed; a quote
 * changes when a new observation is recorded. And a row whose quote is missing
 * renders an em dash instead of a number, so an asset is never quietly assigned
 * a price it does not have.
 */

type SortKey = 'name' | 'price' | 'change24h' | 'marketCap' | 'volume24h';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Asset' },
  { key: 'price', label: 'Price', className: 'text-right' },
  { key: 'change24h', label: '24h', className: 'text-right' },
  { key: 'marketCap', label: 'Market cap', className: 'text-right hidden md:table-cell' },
  { key: 'volume24h', label: '24h volume', className: 'text-right hidden lg:table-cell' },
];

export function MarketTable({
  markets,
  limit,
  showControls = true,
  className,
}: {
  markets: readonly MarketDto[];
  limit?: number;
  showControls?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'marketCap',
    dir: 'desc',
  });

  // Keeps typing responsive: the input updates immediately while the (larger)
  // filtered table re-renders at a lower priority.
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();

    const filtered = markets.filter((market) => {
      const matchesCategory = category === 'All' || market.category === category;
      const matchesQuery =
        !needle ||
        market.name.toLowerCase().includes(needle) ||
        market.symbol.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });

    const sorted = [...filtered].sort((a, b) => compareBy(a, b, sort.key));
    if (sort.dir === 'desc') sorted.reverse();

    return limit ? sorted.slice(0, limit) : sorted;
  }, [markets, deferredQuery, category, sort, limit]);

  const toggleSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc',
    }));

  return (
    <div className={className}>
      {showControls ? (
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${markets.length} assets`}
              aria-label="Search assets"
              className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-sm text-fg outline-none backdrop-blur-md transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
            />
          </div>
          <div className="mask-x -mx-1 overflow-x-auto pb-1">
            <div className="flex items-center gap-2 px-1">
              {['All', ...MARKET_CATEGORIES].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  aria-pressed={category === option}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-300',
                    category === option
                      ? 'border-brand-soft/60 bg-brand/15 text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <Card className="overflow-x-auto" edge={false}>
        <table className="w-full min-w-[38rem] border-collapse">
          <caption className="sr-only">
            Prices for {rows.length} digital assets, from the most recent observation of each.
          </caption>
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort.key === column.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={cn('px-5 py-4 text-left', column.className)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                      sort.key === column.key ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                    )}
                  >
                    {column.label}
                    <ArrowUpDown className="size-3" />
                  </button>
                </th>
              ))}
              <th
                scope="col"
                className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-fg-subtle"
              >
                7d
              </th>
              <th scope="col" className="px-5 py-4">
                <span className="sr-only">Trade</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((market) => {
              const quote = market.quote;
              const priced = quote.state !== 'unavailable';
              const up = priced && quote.direction !== 'down';

              return (
                <tr
                  key={market.symbol}
                  className="group border-b border-line/60 transition-colors duration-300 last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-5 py-4">
                    <Link href={`/markets/${market.slug}`} className="flex items-center gap-3">
                      <AssetMark symbol={market.symbol} glyph={market.glyph} hue={market.hue} />
                      <span>
                        <span className="block text-sm font-medium text-fg">{market.name}</span>
                        <span className="block text-xs text-fg-subtle">{market.symbol}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {priced ? (
                      <span
                        data-numeric
                        className="inline-block rounded-sm px-1.5 py-0.5 text-sm font-medium text-fg"
                        title={
                          quote.state === 'stale' && quote.ageSeconds !== null
                            ? `Last observed ${formatAge(quote.ageSeconds)}`
                            : undefined
                        }
                      >
                        {formatPrice(quote.price, quote.currency)}
                        {quote.state === 'stale' ? (
                          <span className="ml-1 align-super text-2xs text-warn" aria-hidden>
                            ●
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-sm text-fg-subtle" title="No recent observation">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {priced ? (
                      <span
                        data-numeric
                        className={cn('text-sm font-semibold', up ? 'text-up' : 'text-down')}
                      >
                        {formatPercent(quote.change24hPercent)}
                      </span>
                    ) : (
                      <span className="text-sm text-fg-subtle">—</span>
                    )}
                  </td>
                  <td
                    data-numeric
                    className="hidden px-5 py-4 text-right text-sm text-fg-muted md:table-cell"
                  >
                    {priced && quote.marketCap ? formatCompact(quote.marketCap, 'USD') : '—'}
                  </td>
                  <td
                    data-numeric
                    className="hidden px-5 py-4 text-right text-sm text-fg-muted lg:table-cell"
                  >
                    {priced && quote.volume24h ? formatCompact(quote.volume24h, 'USD') : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end">
                      {priced && quote.sparkline ? (
                        <Sparkline
                          id={`table-${market.symbol}`}
                          data={quote.sparkline}
                          positive={quote.change7dPercent >= 0}
                          width={96}
                          height={32}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ButtonLink
                      href={`/trade?asset=${market.slug}`}
                      variant="outline"
                      size="sm"
                      className="opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      Trade
                    </ButtonLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-fg-muted">
            No assets match “{query}”.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/** Ascending comparison; the caller reverses for descending. */
function compareBy(a: MarketDto, b: MarketDto, key: SortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name);

  const quoteA = a.quote;
  const quoteB = b.quote;
  // Unpriced rows sort to the bottom in both directions rather than being
  // treated as zero, which would rank them below a genuine low price.
  if (quoteA.state === 'unavailable' || quoteB.state === 'unavailable') {
    if (quoteA.state === quoteB.state) return 0;
    return quoteA.state === 'unavailable' ? 1 : -1;
  }

  switch (key) {
    case 'price':
      return compareNullableDecimals(quoteA.price, quoteB.price);
    case 'change24h':
      return quoteA.change24hPercent - quoteB.change24hPercent;
    case 'marketCap':
      return compareNullableDecimals(quoteA.marketCap, quoteB.marketCap);
    case 'volume24h':
      return compareNullableDecimals(quoteA.volume24h, quoteB.volume24h);
  }
}
