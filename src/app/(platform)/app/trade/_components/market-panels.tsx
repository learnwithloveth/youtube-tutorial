'use client';

import type { CandleDto, OrderBookDto, PublicTradeDto } from '@/modules/market-data';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { CandleChart } from '@/shared/ui/charts/candle-chart';
import { DepthChart } from '@/shared/ui/charts/depth-chart';
import type { BookLevel } from '@/shared/ui/charts/types';
import { cn } from '@/shared/lib/cn';

/**
 * The chart half of the terminal.
 *
 * ── Client, because charts measure themselves ──────────────────────────────────
 * `useChartSize` reads the element's width to lay out the plot, which needs the
 * DOM. The data arrives as props already fetched on the server, so this island
 * hydrates to draw and never to load.
 *
 * ── Where exact decimals become numbers, and why that is allowed here ──────────
 * Every value crosses from the server as an exact decimal string. Plotting turns
 * them into `number`, which is the documented lossy boundary this codebase permits
 * at the point of render — a pixel coordinate cannot be a `bigint` and no figure
 * derived from these numbers is ever shown as a price. The prices *printed* beside
 * the chart are the original strings, untouched.
 */

export function PriceChart({
  candles,
  interval,
  quoteCurrency,
}: {
  candles: readonly CandleDto[];
  interval: string;
  quoteCurrency: string;
}) {
  if (candles.length === 0) {
    return (
      <ChartFrame
        title="Price"
        subtitle="No candles available"
        // `ChartFrame` requires the accessible table even when empty: the frame's
        // contract is that every chart has a tabular equivalent, and letting the
        // empty case skip it is how a chart ships without one.
        table={{ columns: ['Open time', 'Close'], numericFrom: 1, rows: [] }}
      >
        <p className="grid h-80 place-items-center text-sm text-fg-subtle">
          The venue did not return candles for this market.
        </p>
      </ChartFrame>
    );
  }

  const plotted = candles.map((candle) => ({
    t: new Date(candle.openTime).getTime(),
    o: Number(candle.open),
    h: Number(candle.high),
    l: Number(candle.low),
    c: Number(candle.close),
    v: Number(candle.volume),
  }));

  return (
    <ChartFrame
      title="Price"
      subtitle={`${interval} candles · quoted in ${quoteCurrency}`}
      table={{
        columns: ['Open time', 'Open', 'High', 'Low', 'Close'],
        numericFrom: 1,
        // The accessible table shows the exact strings, not the plotted numbers.
        rows: candles.slice(-20).map((candle) => [
          stamp(candle.openTime),
          candle.open,
          candle.high,
          candle.low,
          candle.close,
        ]),
      }}
    >
      <CandleChart
        candles={plotted}
        height={320}
        formatPrice={(value) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        formatAxis={(value) => compact(value)}
        formatX={(t) => stamp(new Date(t).toISOString())}
        formatVolume={(value) => compact(value)}
      />
    </ChartFrame>
  );
}

export function Depth({ book }: { book: OrderBookDto }) {
  const bids = toLevels(book.bids);
  const asks = toLevels(book.asks);

  // The midpoint, not the last trade: a depth chart is centred on where the book
  // is, and the two differ by the spread at exactly the moments that matter.
  const mid =
    book.bestBid !== null && book.bestAsk !== null
      ? (Number(book.bestBid) + Number(book.bestAsk)) / 2
      : (bids[0]?.price ?? asks[0]?.price ?? 0);

  return (
    <DepthChart
      bids={bids}
      asks={asks}
      mid={mid}
      formatPrice={(value) => value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
    />
  );
}

function toLevels(levels: OrderBookDto['bids']): BookLevel[] {
  return levels.map((level) => ({
    price: Number(level.price),
    size: Number(level.size),
    total: Number(level.total),
  }));
}

/**
 * The tape.
 *
 * Side comes from the venue's maker flag, not from comparing consecutive prices —
 * a run of equal prints is ordinary and says nothing about who was aggressive.
 */
export function Tape({ trades }: { trades: readonly PublicTradeDto[] }) {
  if (trades.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-subtle">No recent trades.</p>;
  }

  return (
    <ul className="space-y-1 font-mono text-xs">
      {trades.map((trade) => (
        <li key={trade.id} className="flex items-baseline justify-between gap-3 tabular-nums">
          <span className={cn(trade.side === 'buy' ? 'text-up' : 'text-down')}>
            {trim(trade.price)}
          </span>
          <span className="text-fg-muted">{trim(trade.quantity)}</span>
          <span className="text-fg-subtle">{clock(trade.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Drops trailing zeros a venue pads to a fixed width.
 *
 * String surgery, not `Number()`: `"0.00007000"` should read as `0.00007`, and
 * parsing it to get there would be a float on a price for a cosmetic reason.
 */
function trim(decimal: string): string {
  if (!decimal.includes('.')) return decimal;
  return decimal.replace(/0+$/, '').replace(/\.$/, '');
}

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

function clock(iso: string): string {
  return clockFormatter.format(new Date(iso));
}

const stampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

function stamp(iso: string): string {
  return stampFormatter.format(new Date(iso));
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
