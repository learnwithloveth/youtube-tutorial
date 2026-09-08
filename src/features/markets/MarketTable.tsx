import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Search } from 'lucide-react';
import { ASSETS, ASSET_CATEGORIES } from './assets';
import { sortQuotes, useLiveQuotes, type MarketSortKey } from './useMarkets';
import type { Quote } from './types';
import { AssetMark } from '@/components/visuals/AssetMark';
import { Sparkline } from '@/components/visuals/Sparkline';
import { Card } from '@/design-system/primitives/Card';
import { ButtonLink } from '@/design-system/primitives/Button';
import { formatCompact, formatPercent, formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';

const COLUMNS: { key: MarketSortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Asset' },
  { key: 'price', label: 'Price', className: 'text-right' },
  { key: 'change24h', label: '24h', className: 'text-right' },
  { key: 'marketCap', label: 'Market cap', className: 'text-right hidden md:table-cell' },
  { key: 'volume24h', label: '24h volume', className: 'text-right hidden lg:table-cell' },
];

function PriceCell({ quote }: { quote: Quote }) {
  return (
    <span
      key={quote.live}
      data-numeric
      className={cn(
        'inline-block rounded-sm px-1.5 py-0.5 text-sm font-medium text-fg',
        quote.direction === 'up' && 'animate-[tick-up_0.6s_var(--ease-out-expo)]',
        quote.direction === 'down' && 'animate-[tick-down_0.6s_var(--ease-out-expo)]',
      )}
    >
      {formatPrice(quote.live)}
    </span>
  );
}

export function MarketTable({
  limit,
  showControls = true,
  className,
}: {
  limit?: number;
  showControls?: boolean;
  className?: string;
}) {
  const quotes = useLiveQuotes(ASSETS);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [sort, setSort] = useState<{ key: MarketSortKey; dir: 'asc' | 'desc' }>({
    key: 'marketCap',
    dir: 'desc',
  });

  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = quotes.filter((q) => {
      const matchesCategory = category === 'All' || q.category === category;
      const matchesQuery =
        !needle || q.name.toLowerCase().includes(needle) || q.symbol.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
    const sorted = sortQuotes(filtered, sort.key, sort.dir);
    return limit ? sorted.slice(0, limit) : sorted;
  }, [quotes, deferredQuery, category, sort, limit]);

  const toggleSort = (key: MarketSortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className={className}>
      {showControls ? (
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 340+ assets"
              aria-label="Search assets"
              className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-sm text-fg outline-none backdrop-blur-md transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
            />
          </div>
          <div className="mask-x -mx-1 overflow-x-auto pb-1">
            <div className="flex items-center gap-2 px-1">
              {['All', ...ASSET_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  aria-pressed={category === cat}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-300',
                    category === cat
                      ? 'border-brand-soft/60 bg-brand/15 text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <Card className="overflow-x-auto" edge={false}>
        <table className="w-full min-w-[38rem] border-collapse">
          <caption className="sr-only">
            Live prices for {rows.length} digital assets, updated every 1.5 seconds.
          </caption>
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className={cn('px-5 py-4 text-left', col.className)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                      sort.key === col.key ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                    )}
                  >
                    {col.label}
                    <ArrowUpDown className="size-3" />
                  </button>
                </th>
              ))}
              <th scope="col" className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                7d
              </th>
              <th scope="col" className="px-5 py-4">
                <span className="sr-only">Trade</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const up = q.change24h >= 0;
              return (
                <tr
                  key={q.id}
                  className="group border-b border-line/60 transition-colors duration-300 last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-5 py-4">
                    <Link to={`/markets/${q.id}`} className="flex items-center gap-3">
                      <AssetMark symbol={q.symbol} glyph={q.glyph} hue={q.hue} />
                      <span>
                        <span className="block text-sm font-medium text-fg">{q.name}</span>
                        <span className="block text-xs text-fg-subtle">{q.symbol}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <PriceCell quote={q} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span
                      data-numeric
                      className={cn('text-sm font-semibold', up ? 'text-up' : 'text-down')}
                    >
                      {formatPercent(q.change24h)}
                    </span>
                  </td>
                  <td data-numeric className="hidden px-5 py-4 text-right text-sm text-fg-muted md:table-cell">
                    {formatCompact(q.marketCap, 'USD')}
                  </td>
                  <td data-numeric className="hidden px-5 py-4 text-right text-sm text-fg-muted lg:table-cell">
                    {formatCompact(q.volume24h, 'USD')}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end">
                      <Sparkline data={q.spark} positive={q.change7d >= 0} width={96} height={32} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ButtonLink
                      to={`/trade?asset=${q.id}`}
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
