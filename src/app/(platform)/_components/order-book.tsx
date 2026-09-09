import type { BookLevel } from '../_data/types';
import { formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

/**
 * Depth bars are drawn as a background fill sized by cumulative total, so the
 * shape of the book reads before any number does. Rows stay tabular so the
 * price column never shifts as sizes change.
 */
function Side({
  levels, side, maxTotal, formatPrice, onPick,
}: {
  levels: readonly BookLevel[];
  side: 'bid' | 'ask';
  maxTotal: number;
  formatPrice: (v: number) => string;
  onPick: (price: number) => void;
}) {
  const rows = side === 'ask' ? [...levels].reverse() : levels;
  return (
    <ul className={cn('flex flex-col', side === 'ask' && 'justify-end')}>
      {rows.map((level) => (
        <li key={level.price}>
          <button
            type="button"
            onClick={() => onPick(level.price)}
            className="relative grid w-full grid-cols-3 gap-2 px-3 py-[3px] text-right font-mono text-2xs transition-colors hover:bg-surface"
          >
            <span
              aria-hidden
              className={cn('absolute inset-y-0 right-0', side === 'bid' ? 'bg-up/12' : 'bg-down/12')}
              style={{ width: `${(level.total / maxTotal) * 100}%` }}
            />
            <span className={cn('relative text-left tabular-nums', side === 'bid' ? 'text-up' : 'text-down')}>
              {formatPrice(level.price)}
            </span>
            <span className="relative tabular-nums text-fg-muted">{formatQuantity(level.size, 3)}</span>
            <span className="relative tabular-nums text-fg-subtle">{formatQuantity(level.total, 2)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function OrderBook({
  bids, asks, mid, spread, formatPrice, onPick,
}: {
  bids: readonly BookLevel[];
  asks: readonly BookLevel[];
  mid: number;
  spread: number;
  formatPrice: (v: number) => string;
  onPick: (price: number) => void;
}) {
  const maxTotal = Math.max(...bids.map((b) => b.total), ...asks.map((a) => a.total));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 px-3 pb-2 text-right font-mono text-2xs uppercase tracking-wider text-fg-subtle">
        <span className="text-left">Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      <Side levels={asks} side="ask" maxTotal={maxTotal} formatPrice={formatPrice} onPick={onPick} />

      <div className="my-1.5 flex items-baseline justify-between border-y border-line px-3 py-2">
        <span className="font-mono text-sm font-semibold tabular-nums text-fg">{formatPrice(mid)}</span>
        <span className="font-mono text-2xs tabular-nums text-fg-subtle">
          spread {formatPrice(spread)}
        </span>
      </div>

      <Side levels={bids} side="bid" maxTotal={maxTotal} formatPrice={formatPrice} onPick={onPick} />
    </div>
  );
}
