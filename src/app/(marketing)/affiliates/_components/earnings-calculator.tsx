'use client';

import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatPrice } from '@/shared/lib/format';
import { Reveal } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';
import { Card } from '@/shared/ui/primitives/card';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';

/** Commission share by referral count, matching the published tiers. */
const ELITE_THRESHOLD = 200;
const PARTNER_THRESHOLD = 25;
const TRADING_FEE_RATE = 0.001;

/**
 * The affiliate earnings estimator.
 *
 * Extracted so the rest of the page — the hero, the tier cards, the terms —
 * renders on the server. The figure it produces is an illustration from two
 * sliders, not a quote, and the copy beneath it says so.
 */
export function EarningsCalculator() {
  const [referrals, setReferrals] = useState(120);
  const [avgVolume, setAvgVolume] = useState(8_000);

  const monthly = useMemo(() => {
    const share =
      referrals >= ELITE_THRESHOLD ? 0.45 : referrals >= PARTNER_THRESHOLD ? 0.4 : 0.3;
    return referrals * avgVolume * TRADING_FEE_RATE * share;
  }, [referrals, avgVolume]);

  return (
      <Section id="calculator" tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow="Calculator"
              title="What the programme would pay you"
              body="Based on a 0.10% average taker fee and your tier's revenue share. Move the sliders."
            />
            <div className="mt-10 space-y-9">
              <div>
                <label htmlFor="referrals" className="text-sm text-fg-muted">
                  Active referrals
                </label>
                <output data-numeric className="mt-2 block font-display text-4xl font-semibold text-fg">
                  {referrals.toLocaleString()}
                </output>
                <input
                  id="referrals"
                  type="range"
                  min={1}
                  max={1000}
                  value={referrals}
                  onChange={(e) => setReferrals(Number(e.target.value))}
                  className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
                />
              </div>
              <div>
                <label htmlFor="volume" className="text-sm text-fg-muted">
                  Average monthly volume each
                </label>
                <output data-numeric className="mt-2 block font-display text-4xl font-semibold text-fg">
                  {formatPrice(avgVolume.toFixed(2)).replace('.00', '')}
                </output>
                <input
                  id="volume"
                  type="range"
                  min={500}
                  max={100_000}
                  step={500}
                  value={avgVolume}
                  onChange={(e) => setAvgVolume(Number(e.target.value))}
                  className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
                />
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="p-8 md:p-10">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Estimated monthly</span>
                <Badge tone="brand">
                  {referrals >= 200 ? 'Elite · 45%' : referrals >= 25 ? 'Partner · 40%' : 'Standard · 30%'}
                </Badge>
              </div>
              <p data-numeric className="mt-6 font-display text-6xl font-semibold text-fg">
                {formatPrice(monthly.toFixed(2)).replace('.00', '')}
              </p>
              <p data-numeric className="mt-3 text-sm text-fg-muted">
                {formatPrice((monthly * 12).toFixed(2)).replace('.00', '')} per year at this rate
              </p>
              <ul className="mt-8 space-y-2.5 border-t border-line pt-6">
                {['Lifetime revenue share', 'No cap on earnings', 'Paid in USDC or fiat', 'Raw attribution export'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-fg-muted">
                      <Check className="size-4 shrink-0 text-up" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </Card>
          </Reveal>
        </div>
      </Section>
  );
}
