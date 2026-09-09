'use client';

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { formatPrice } from '@/shared/lib/format';
import { Reveal } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';
import { Card } from '@/shared/ui/primitives/card';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';

import { BASE_TIER, TIERS } from '../_lib/tiers';

const SIDES = [
  { value: 'taker', label: 'Taker' },
  { value: 'maker', label: 'Maker' },
] as const satisfies readonly { value: OrderSide; label: string }[];

type OrderSide = 'taker' | 'maker';

/**
 * The fee calculator and the schedule beneath it.
 *
 * They are one component because they share state: the table highlights
 * whichever tier the slider currently lands in. Splitting them would mean
 * lifting that state into the page and making the page a Client Component,
 * which is the opposite of the goal.
 */
export function FeeExplorer() {
  const [volume, setVolume] = useState(25_000);
  const [side, setSide] = useState<OrderSide>('taker');

  // TIERS is a non-empty literal, but the compiler cannot know that from an
  // index, so the base tier is named explicitly rather than asserted.
  const tier = useMemo(
    () => [...TIERS].reverse().find((candidate) => volume >= candidate.volume) ?? BASE_TIER,
    [volume],
  );
  const rate = side === 'taker' ? tier.taker : tier.maker;
  const monthlyCost = (volume * rate) / 100;

  return (
    <>
      <Section>
        <div className="shell grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:items-center">
          <Reveal>
            <p className="eyebrow mb-5">Estimator</p>
            <h2 className="text-3xl font-semibold">What would you actually pay?</h2>
            <p className="mt-4 text-fg-muted">
              Drag your 30-day volume to see the tier you land in and the fee on that volume.
            </p>

            <div className="mt-8">
              <label htmlFor="volume" className="text-sm text-fg-muted">
                30-day trading volume
              </label>
              <output
                htmlFor="volume"
                data-numeric
                className="mt-2 block font-display text-4xl font-semibold text-fg"
              >
                {formatPrice(volume.toFixed(2)).replace('.00', '')}
              </output>
              <input
                id="volume"
                type="range"
                min={0}
                max={100_000_000}
                step={5_000}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="mt-5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
              />
              <div className="mt-3 flex justify-between text-2xs text-fg-subtle">
                <span>$0</span>
                <span>$100M</span>
              </div>
            </div>

            <SegmentedControl
              ariaLabel="Order side"
              className="mt-7"
              segments={SIDES}
              value={side}
              onChange={setSide}
            />
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="p-8">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Your tier</span>
                <Badge tone="brand">{tier.name}</Badge>
              </div>
              <p className="mt-6 font-display text-6xl font-semibold text-fg">
                <span data-numeric>{rate.toFixed(3)}%</span>
              </p>
              <p className="mt-2 text-sm text-fg-muted">
                {rate < 0 ? 'Rebate paid to you on every maker fill' : `${side} fee on every fill`}
              </p>

              <dl className="mt-8 space-y-3 border-t border-line pt-6 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-subtle">Fee on this volume</dt>
                  <dd data-numeric className={cn('font-medium', monthlyCost < 0 ? 'text-up' : 'text-fg')}>
                    {formatPrice(Math.abs(monthlyCost).toFixed(2))}
                    {monthlyCost < 0 ? ' earned' : ''}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-subtle">Deposits & withdrawals</dt>
                  <dd className="font-medium text-up">Free on local rails</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-subtle">Custody</dt>
                  <dd className="font-medium text-up">$0</dd>
                </div>
              </dl>

              <ul className="mt-7 space-y-2.5 border-t border-line pt-6">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2.5 text-sm text-fg-muted">
                    <Check className="size-4 shrink-0 text-up" />
                    {perk}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading
            eyebrow="Schedule"
            title="The whole fee table"
            body="Published in full, updated with 30 days' notice, and never negotiated behind a login."
          />
          <Reveal delay={0.1}>
            <Card className="mt-12 overflow-x-auto" edge={false}>
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {['Tier', '30-day volume', 'Maker', 'Taker', 'Included'].map((h) => (
                      <th key={h} scope="col" className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((t) => (
                    <tr
                      key={t.name}
                      className={cn(
                        'border-b border-line/60 transition-colors last:border-0 hover:bg-surface-hover',
                        t.name === tier.name && 'bg-brand/8',
                      )}
                    >
                      <td className="px-5 py-4 font-medium text-fg">{t.name}</td>
                      <td data-numeric className="px-5 py-4 text-fg-muted">
                        ≥ {t.volume.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </td>
                      <td data-numeric className={cn('px-5 py-4 font-medium', t.maker <= 0 ? 'text-up' : 'text-fg-muted')}>
                        {t.maker.toFixed(3)}%
                      </td>
                      <td data-numeric className="px-5 py-4 text-fg-muted">
                        {t.taker.toFixed(3)}%
                      </td>
                      <td className="px-5 py-4 text-xs text-fg-subtle">{t.perks.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
