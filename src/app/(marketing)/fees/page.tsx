import type { Metadata } from 'next';

import { FeeExplorer } from './_components/fee-explorer';
import { ArrowRight, Check, Info, Minus } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { DisclosureList } from '@/shared/ui/primitives/disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';

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

export const metadata: Metadata = {
  title: 'Fees',
  description:
    'The whole fee schedule, published in full: maker rebates from -0.005%, free local-rail deposits, no custody fee.',
};

export default function FeesPage() {
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
          <ButtonLink href="/signup" size="lg" sheen>
            Start with 30 days free
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
        }
      />

      <FeeExplorer />


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
