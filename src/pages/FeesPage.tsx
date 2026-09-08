import { useMemo, useState } from 'react';
import { ArrowRight, Check, Info, Minus } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { ButtonLink } from '@/design-system/primitives/Button';
import { SegmentedControl } from '@/design-system/primitives/SegmentedControl';
import { DisclosureList } from '@/design-system/primitives/Disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { formatPrice } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';

interface Tier {
  name: string;
  volume: number;
  maker: number;
  taker: number;
  perks: string[];
}

const TIERS: Tier[] = [
  { name: 'Base', volume: 0, maker: 0.02, taker: 0.1, perks: ['30 days commission-free', 'Free local-rail deposits'] },
  { name: 'Silver', volume: 50_000, maker: 0.015, taker: 0.08, perks: ['Priority support queue', 'Higher withdrawal limits'] },
  { name: 'Gold', volume: 500_000, maker: 0.008, taker: 0.05, perks: ['Dedicated account manager', 'API rate limit ×4'] },
  { name: 'Platinum', volume: 5_000_000, maker: 0.0, taker: 0.04, perks: ['Zero maker fees', 'Colocated API endpoint'] },
  { name: 'Prime', volume: 50_000_000, maker: -0.005, taker: 0.03, perks: ['Maker rebate paid daily', 'FIX 4.4 session', 'OTC desk access'] },
];

const COMPARISON = [
  { feature: 'Spot taker fee, base tier', novex: '0.10%', them: '0.40% – 0.60%' },
  { feature: 'Maker rebate available', novex: true, them: false },
  { feature: 'Local-rail deposit fee', novex: 'Free', them: '$0 – $25' },
  { feature: 'Fiat withdrawal fee', novex: 'Free', them: '$1 – $35' },
  { feature: 'Spread markup on conversions', novex: false, them: true },
  { feature: 'Volume tier recalculated', novex: 'Hourly', them: 'Monthly' },
  { feature: 'Staking commission', novex: '8%', them: '25% – 35%' },
  { feature: 'Custody fee', novex: 'Free', them: '0 – 0.4% p.a.' },
];

const FEE_FAQ = [
  { question: 'How is my volume tier calculated?', answer: 'We look at your trailing 30-day taker + maker notional volume in USD, recalculated every hour. Moving up a tier applies immediately; moving down only happens at the daily boundary, so a quiet afternoon never costs you a rate.' },
  { question: 'What is a maker rebate?', answer: 'A maker order adds liquidity to the book rather than taking it. At Prime tier your maker fee is negative — Novex pays you 0.005% of the notional, settled daily in the quote currency.' },
  { question: 'Are there hidden spreads?', answer: 'No. The rate you see on the conversion widget is the routed mid-price and the fee is quoted separately. We do not mark up the rate and take a second margin inside it.' },
  { question: 'What about network fees?', answer: 'On-chain withdrawals carry the network fee at cost, shown before you confirm. Novex adds nothing on top and does not round up.' },
];

export default function FeesPage() {
  useSeo({
    title: 'Fees & pricing',
    description:
      'Spot fees from 0.10% taker and 0.02% maker, falling to a −0.005% maker rebate. No spread markup, no custody fee, no withdrawal fee on local rails.',
  });

  const [volume, setVolume] = useState(25_000);
  const [side, setSide] = useState<'taker' | 'maker'>('taker');

  const tier = useMemo(
    () => [...TIERS].reverse().find((t) => volume >= t.volume) ?? TIERS[0],
    [volume],
  );
  const rate = side === 'taker' ? tier.taker : tier.maker;
  const monthlyCost = (volume * rate) / 100;

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Fees you can read
            <br />
            <span className="text-aurora">in under a minute.</span>
          </>
        }
        body="One schedule, published in full. No spread markup buried in the rate, no custody fee, and tiers that recalculate hourly instead of monthly."
        actions={
          <ButtonLink to="/signup" size="lg" sheen>
            Start with 30 days free
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
        }
      />

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
                {formatPrice(volume).replace('.00', '')}
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
              segments={[
                { value: 'taker', label: 'Taker' },
                { value: 'maker', label: 'Maker' },
              ]}
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
                    {formatPrice(Math.abs(monthlyCost))}
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

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Comparison"
            title="Against the industry average"
            body="Figures for the right-hand column are the range published by the four largest retail venues at the time of writing."
          />
          <StaggerGroup className="mt-12 overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1.6fr_1fr_1fr] border-b border-line bg-bg-sunken/60 px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              <span>Feature</span>
              <span className="text-center text-brand-soft">Novex</span>
              <span className="text-center">Industry range</span>
            </div>
            {COMPARISON.map((row) => (
              <StaggerItem key={row.feature}>
                <div className="grid grid-cols-[1.6fr_1fr_1fr] items-center border-b border-line/60 px-5 py-4 text-sm last:border-0">
                  <span className="text-fg-muted">{row.feature}</span>
                  <span className="flex justify-center">
                    {typeof row.novex === 'boolean' ? (
                      row.novex ? <Check className="size-4 text-up" /> : <Minus className="size-4 text-fg-subtle" />
                    ) : (
                      <span data-numeric className="font-medium text-fg">{row.novex}</span>
                    )}
                  </span>
                  <span className="flex justify-center">
                    {typeof row.them === 'boolean' ? (
                      row.them ? <Check className="size-4 text-fg-subtle" /> : <Minus className="size-4 text-fg-subtle" />
                    ) : (
                      <span data-numeric className="text-fg-subtle">{row.them}</span>
                    )}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
          <Reveal>
            <p className="mt-6 flex items-start gap-2 text-xs text-fg-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Illustrative figures for a demonstration site. Always check the live schedule of any
              venue before trading.
            </p>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading align="left" eyebrow="Questions" title="Fee questions, answered" className="lg:sticky lg:top-28 lg:self-start" />
          <Reveal delay={0.1}>
            <DisclosureList items={FEE_FAQ} />
          </Reveal>
        </div>
      </Section>

      <CtaBand title="Thirty days, zero commission." body="New accounts trade the top 20 pairs free for a full month. No card required." />
    </>
  );
}
