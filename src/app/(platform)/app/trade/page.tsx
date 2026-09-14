import type { Metadata } from 'next';
import Link from 'next/link';
import { Info, TriangleAlert } from 'lucide-react';

import type { CandleInterval } from '@/modules/market-data';
import { CANDLE_INTERVALS } from '@/modules/market-data';
import { requireUser } from '@/server/auth';
import { getWalletFor } from '@/server/ledger';
import { getBook, getMarketCandles, getMarkets, getTape } from '@/server/market-data';
import { formatPercent } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { Depth, PriceChart, Tape } from './_components/market-panels';

/**
 * The trading terminal.
 *
 * ── What is real now ───────────────────────────────────────────────────────────
 * The book, the candles, the depth and the tape all come from Binance's public
 * market-data service — live depth to twenty levels, real OHLCV, real prints.
 * Everything on this page that describes *the market* is an observation.
 *
 * ── What is not, and why there is no order form ────────────────────────────────
 * The page this replaced had a working-looking order ticket over a simulated book
 * built by `buildBook()`. Placing an order needs one of two things this platform
 * does not have: a matching engine with its own book, or a principal desk that
 * sells from inventory and hedges. Neither is an API away — they are the exchange.
 *
 * A ticket that accepts an order and does nothing with it is worse than no ticket,
 * so it is gone and the page says why. The balances beside the book are real, from
 * the ledger, so the one honest thing the page can tell a customer about their own
 * position is still there.
 *
 * ── The market selection lives in the URL ──────────────────────────────────────
 * Which keeps this a Server Component: the book is fetched per request, a market is
 * a shareable link, and no order book ships to the browser as JSON for a component
 * to re-render.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Trade',
  robots: { index: false, follow: false },
};

export default async function TradeTerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser('/app/trade');

  const markets = await getMarkets({ limit: 12 });
  const selected =
    markets.find((market) => market.symbol === params.market?.toUpperCase()) ?? markets[0];

  const interval = (CANDLE_INTERVALS as readonly string[]).includes(params.interval ?? '')
    ? (params.interval as CandleInterval)
    : '1h';

  if (selected === undefined) {
    return (
      <>
        <PageHeader title="Trade" description="No markets are listed." />
        <Panel>
          <p className="py-14 text-center text-sm text-fg-subtle">
            The catalogue returned nothing to trade.
          </p>
        </Panel>
      </>
    );
  }

  // Independent reads, awaited together. Each resolves to null on failure rather
  // than rejecting, so there is no unattached rejection to leak.
  const [book, candles, tape, wallet] = await Promise.all([
    getBook(selected.symbol, 20),
    getMarketCandles(selected.symbol, interval, 120),
    getTape(selected.symbol, 24),
    getWalletFor(user.id as UserId),
  ]);

  const balance = wallet.balances.find((entry) => entry.asset === selected.symbol);
  const quote = selected.quote.state === 'unavailable' ? null : selected.quote;

  return (
    <>
      <PageHeader
        title="Trade"
        description="Live depth, candles and prints from the public market."
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-bg-elev/70 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-soft" />
        <p className="min-w-0 text-sm text-fg">
          Order placement is not available on this platform.{' '}
          <span className="text-fg-muted">
            The market data below is live. Executing against it needs a matching
            engine or a principal desk, neither of which exists here — so there is
            no order ticket rather than one that accepts orders and does nothing.
          </span>
        </p>
      </div>

      {/* ── Market picker ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {markets.map((market) => (
          <Link
            key={market.symbol}
            href={`/app/trade?market=${market.symbol}${interval === '1h' ? '' : `&interval=${interval}`}`}
            aria-current={market.symbol === selected.symbol ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              market.symbol === selected.symbol
                ? 'border-brand-soft/60 bg-brand/12 text-fg'
                : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            <AssetMark
              symbol={market.symbol}
              glyph={market.glyph}
              hue={market.hue}
              size="sm"
            />
            {market.symbol}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-4">
        <h2 className="font-display text-2xl font-semibold text-fg">
          {selected.name}
          <span className="ml-2 text-base font-normal text-fg-subtle">
            {selected.symbol}
          </span>
        </h2>
        {quote === null ? (
          <Badge tone="neutral">No price</Badge>
        ) : (
          <>
            <span className="font-sans text-2xl font-semibold tabular-nums text-fg">
              {/* The exact string from the feed, not a parsed number. */}
              {quote.price}
              <span className="ml-1.5 text-sm text-fg-subtle">{quote.currency}</span>
            </span>
            <span
              className={cn(
                'text-sm',
                quote.change24hPercent >= 0 ? 'text-up' : 'text-down',
              )}
            >
              {formatPercent(quote.change24hPercent)}
            </span>
            {quote.state === 'stale' ? <Badge tone="warn">Stale</Badge> : null}
          </>
        )}
        {balance ? (
          <span className="ml-auto text-xs text-fg-subtle">
            You hold{' '}
            <span className="font-mono text-fg">
              {balance.total} {balance.asset}
            </span>
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          {/* ── Interval picker ─────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-1">
            {CANDLE_INTERVALS.map((option) => (
              <Link
                key={option}
                href={`/app/trade?market=${selected.symbol}&interval=${option}`}
                aria-current={option === interval ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  option === interval
                    ? 'bg-surface-strong text-fg'
                    : 'text-fg-muted hover:bg-surface hover:text-fg',
                )}
              >
                {option}
              </Link>
            ))}
          </div>

          <PriceChart
            candles={candles ?? []}
            interval={interval}
            quoteCurrency={book?.quoteCurrency ?? 'USDT'}
          />

          <Panel>
            <PanelHeader
              title="Depth"
              subtitle={
                book === null
                  ? 'Unavailable'
                  : `Twenty levels each side, quoted in ${book.quoteCurrency}`
              }
            />
            {book === null ? (
              <Unavailable what="depth" />
            ) : (
              <Depth book={book} />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Order book"
              subtitle={
                book === null
                  ? 'Unavailable'
                  : book.spread !== null
                    ? `Spread ${book.spread} ${book.quoteCurrency}`
                    : `Quoted in ${book.quoteCurrency}`
              }
            />
            {book === null ? (
              <Unavailable what="the book" />
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {[...book.asks].slice(0, 8).reverse().map((level) => (
                  <Row key={`a${level.price}`} level={level} side="ask" />
                ))}

                <p className="flex items-baseline justify-between border-y border-line py-2 text-sm">
                  <span className="text-fg">{book.bestBid ?? '—'}</span>
                  <span className="text-2xs text-fg-subtle">
                    {book.spread === null ? 'no spread' : `spread ${book.spread}`}
                  </span>
                </p>

                {book.bids.slice(0, 8).map((level) => (
                  <Row key={`b${level.price}`} level={level} side="bid" />
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent trades" subtitle="Prints from the venue" />
            {tape === null ? <Unavailable what="the tape" /> : <Tape trades={tape} />}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({
  level,
  side,
}: {
  level: { price: string; size: string };
  side: 'bid' | 'ask';
}) {
  return (
    <p className="flex items-baseline justify-between gap-3 tabular-nums">
      <span className={cn(side === 'bid' ? 'text-up' : 'text-down')}>{level.price}</span>
      <span className="text-fg-muted">{level.size}</span>
    </p>
  );
}

/**
 * The absence of market data, stated.
 *
 * Never a zero and never an empty chart that reads as a flat market — "we did not
 * get an answer" and "there is nothing there" are different facts, and on a
 * trading screen the difference is the whole point.
 */
function Unavailable({ what }: { what: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-10 text-sm text-fg-subtle">
      <TriangleAlert className="size-4 text-warn" />
      The venue did not return {what} for this market.
    </p>
  );
}
