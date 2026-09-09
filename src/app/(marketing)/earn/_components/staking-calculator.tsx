'use client';

import { useMemo, useState } from 'react';

import type { InstrumentDto } from '@/modules/market-data';
import { cn } from '@/shared/lib/cn';
import { formatPrice } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';
import { Card } from '@/shared/ui/primitives/card';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';

type Horizon = '1y' | '3y' | '5y';

const HORIZONS = [
  { value: '1y', label: '1 year' },
  { value: '3y', label: '3 years' },
  { value: '5y', label: '5 years' },
] as const satisfies readonly { value: Horizon; label: string }[];

/** Growth curve for the projection panel. A fixed illustration, not a forecast. */
const YIELD_SHAPE = [
  0, 0.03, 0.06, 0.1, 0.13, 0.17, 0.21, 0.25, 0.29, 0.33, 0.37, 0.42, 0.46, 0.51, 0.55, 0.6,
  0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1,
];

/**
 * The staking projection.
 *
 * Extracted from the page so the page itself stays a Server Component: this
 * calculator is the only interactive part of a long, otherwise static document.
 * Its assets arrive as a prop, so the rates it projects from are the ones
 * recorded against the listed instruments.
 */
export function StakingCalculator({ assets }: { assets: readonly InstrumentDto[] }) {
  const [symbol, setSymbol] = useState(assets[0]?.symbol ?? '');
  const [amount, setAmount] = useState(10_000);
  const [horizon, setHorizon] = useState<Horizon>('1y');

  const asset = assets.find((item) => item.symbol === symbol) ?? assets[0];
  const years = horizon === '1y' ? 1 : horizon === '3y' ? 3 : 5;

  const projection = useMemo(() => {
    const rate = (asset?.yieldPercent ?? 0) / 100;
    // Daily compounding, matching how rewards are actually credited.
    const final = amount * Math.pow(1 + rate / 365, 365 * years);
    return { final, earned: final - amount };
  }, [asset, amount, years]);

  if (!asset) return null;

  return (
    <Card className="mt-12 grid gap-10 p-8 lg:grid-cols-[1fr_1fr] md:p-10">
      <div>
        <label htmlFor="stake-asset" className="text-sm font-medium text-fg">
          Asset
        </label>
        <div className="mask-x mt-3 overflow-x-auto pb-1">
          <div className="flex gap-2" id="stake-asset">
            {assets.slice(0, 8).map((option) => (
              <button
                key={option.symbol}
                type="button"
                onClick={() => setSymbol(option.symbol)}
                aria-pressed={option.symbol === asset.symbol}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-300',
                  option.symbol === asset.symbol
                    ? 'border-brand-soft/60 bg-brand/15 text-fg'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                <AssetMark
                  symbol={option.symbol}
                  glyph={option.glyph}
                  hue={option.hue}
                  size="sm"
                />
                {option.symbol}
              </button>
            ))}
          </div>
        </div>

        <label htmlFor="stake-amount" className="mt-8 block text-sm font-medium text-fg">
          Amount staked
        </label>
        <output data-numeric className="mt-2 block font-display text-4xl font-semibold text-fg">
          {formatPrice(amount.toFixed(2)).replace('.00', '')}
        </output>
        <input
          id="stake-amount"
          type="range"
          min={500}
          max={500_000}
          step={500}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
          className="mt-5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
        />

        <SegmentedControl
          ariaLabel="Time horizon"
          className="mt-8"
          segments={HORIZONS}
          value={horizon}
          onChange={setHorizon}
        />
      </div>

      <div className="rounded-lg border border-line bg-bg-sunken/70 p-7">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Projected value</span>
          <Badge tone="up">{asset.yieldPercent?.toFixed(1)}% APY</Badge>
        </div>
        <p data-numeric className="mt-6 font-display text-5xl font-semibold text-fg">
          {formatPrice(projection.final.toFixed(2)).replace('.00', '')}
        </p>
        <p data-numeric className="mt-2 text-sm font-medium text-up">
          +{formatPrice(projection.earned.toFixed(2)).replace('.00', '')} earned over {years} year
          {years > 1 ? 's' : ''}
        </p>
        <div className="mt-7">
          <Sparkline
            id="earn-yield"
            data={YIELD_SHAPE}
            color="var(--up)"
            width={340}
            height={80}
            className="w-full"
          />
        </div>
        <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
          Assumes the current rate holds and rewards are restaked daily. Rates float with network
          conditions; this is an illustration, not a forecast.
        </p>
      </div>
    </Card>
  );
}
