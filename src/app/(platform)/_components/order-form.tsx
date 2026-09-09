'use client';

import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { formatQuantity } from '@/shared/lib/format';
import { money } from '../../_console/data/format';
import { cn } from '@/shared/lib/cn';
import type { OrderSide, OrderType } from '../_data/types';

const TYPES = [
  { value: 'limit', label: 'Limit' },
  { value: 'market', label: 'Market' },
  { value: 'stop-limit', label: 'Stop' },
] as const satisfies readonly { value: OrderType; label: string }[];

const FEE = { maker: 0.0002, taker: 0.0008 };

/**
 * Order entry.
 *
 * The fee line names which side of the book the order will land on, because at
 * this tier the maker rate is a quarter of the taker rate — that difference is
 * the reason post-only exists, so the form says it out loud.
 */
export function OrderForm({
  market, base, price, available, onPriceChange,
}: {
  market: string;
  base: string;
  price: number;
  available: number;
  onPriceChange: (next: number) => void;
}) {
  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<OrderType>('limit');
  const [amount, setAmount] = useState('0.25');
  const [postOnly, setPostOnly] = useState(true);

  const size = Number.parseFloat(amount) || 0;
  const isMaker = type === 'limit' && postOnly;
  const { notional, fee, total } = useMemo(() => {
    const n = size * price;
    const f = n * (isMaker ? FEE.maker : FEE.taker);
    return { notional: n, fee: f, total: side === 'buy' ? n + f : n - f };
  }, [size, price, isMaker, side]);

  const pctOfBalance = available === 0 ? 0 : Math.min(100, (notional / available) * 100);

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <SegmentedControl
        ariaLabel="Order side"
        className="w-full [&>button]:flex-1"
        segments={[
          { value: 'buy', label: `Buy ${base}` },
          { value: 'sell', label: `Sell ${base}` },
        ]}
        value={side}
        onChange={setSide}
      />

      <SegmentedControl
        ariaLabel="Order type"
        size="sm"
        segments={TYPES}
        value={type}
        onChange={setType}
      />

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-fg-muted">Price</span>
            <span className="text-fg-subtle">{type === 'market' ? 'Best available' : 'USD'}</span>
          </span>
          <input
            inputMode="decimal"
            disabled={type === 'market'}
            value={type === 'market' ? '' : price.toFixed(2)}
            placeholder={type === 'market' ? 'Market' : undefined}
            onChange={(e) => onPriceChange(Number.parseFloat(e.target.value) || price)}
            className="h-11 w-full rounded-md border border-line bg-bg-sunken/60 px-3 font-mono text-sm tabular-nums text-fg outline-none transition-colors hover:border-line-strong focus:border-brand-soft disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-fg-muted">Amount</span>
            <span className="text-fg-subtle">{base}</span>
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="h-11 w-full rounded-md border border-line bg-bg-sunken/60 px-3 font-mono text-sm tabular-nums text-fg outline-none transition-colors hover:border-line-strong focus:border-brand-soft"
          />
        </label>

        <div className="flex gap-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setAmount(((available * (pct / 100)) / price).toFixed(4))}
              className="flex-1 rounded-sm border border-line py-1.5 text-2xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {type === 'limit' ? (
        <label className="flex items-center gap-2.5 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={postOnly}
            onChange={(e) => setPostOnly(e.target.checked)}
            className="size-3.5 rounded-xs border-line accent-[var(--brand)]"
          />
          Post-only — never cross the spread
        </label>
      ) : null}

      <dl className="space-y-2 border-t border-line pt-3.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-fg-subtle">Order value</dt>
          <dd className="tabular-nums text-fg-muted">{money(notional)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="flex items-center gap-1 text-fg-subtle">
            Fee · {isMaker ? 'maker 0.02%' : 'taker 0.08%'}
            <Info className="size-3" />
          </dt>
          <dd className="tabular-nums text-fg-muted">{money(fee)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2">
          <dt className="font-medium text-fg">{side === 'buy' ? 'Total cost' : 'You receive'}</dt>
          <dd className="font-medium tabular-nums text-fg">{money(total)}</dd>
        </div>
      </dl>

      <div>
        <div className="flex justify-between text-2xs text-fg-subtle">
          <span>Uses {pctOfBalance.toFixed(0)}% of available</span>
          <span className="tabular-nums">{money(available)} free</span>
        </div>
        <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', pctOfBalance > 90 ? 'bg-warn' : 'bg-brand-soft')}
            style={{ width: `${pctOfBalance}%` }}
          />
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        className={cn('w-full', side === 'buy' ? 'bg-up text-[#04130d]' : 'bg-down text-[#1a0509]')}
      >
        {side === 'buy' ? 'Buy' : 'Sell'} {formatQuantity(size, 4)} {base}
      </Button>

      <p className="text-center text-2xs text-fg-subtle">
        Demonstration form on {market} — no order is placed.
      </p>
    </form>
  );
}
