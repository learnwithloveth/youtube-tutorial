import { ArrowRight, Building2, CreditCard, Landmark, Repeat, Shuffle, Wallet } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { FaqSection } from '../_components/sections/faq-section';
import { FeatureRows, type FeatureRow } from '../_components/sections/feature-rows';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { BuySellWidget } from '../_components/buy-sell-widget';
import { TickerStrip } from '../_components/ticker-strip';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { PhoneMock } from '@/shared/ui/visuals/phone-mock';
import type { Metadata } from 'next';

import { getMarkets } from '@/server/market-data';


const FUNDING = [
  { icon: Landmark, title: 'Bank transfer', detail: 'SEPA, FPS, ACH, PIX, NIP', fee: 'Free', time: 'Under 2 minutes' },
  { icon: CreditCard, title: 'Debit or credit card', detail: 'Visa, Mastercard, Amex', fee: 'Network cost', time: 'Instant' },
  { icon: Wallet, title: 'On-chain deposit', detail: '32 networks supported', fee: 'Free', time: '1–12 confirmations' },
  { icon: Building2, title: 'Wire / SWIFT', detail: 'For amounts over $100k', fee: '$15 flat', time: '1–3 business days' },
];

const ORDER_TYPES = [
  { name: 'Market', body: 'Fill immediately at the best available price across the aggregated book.' },
  { name: 'Limit', body: 'Set your price and wait. Post-only available to guarantee the maker rebate.' },
  { name: 'Stop-limit', body: 'Arm a limit order that only activates once the market crosses your trigger.' },
  { name: 'Trailing stop', body: 'A stop that follows the market up and locks in the retreat you choose.' },
  { name: 'TWAP', body: 'Slice a large order across a window to minimise market impact.' },
  { name: 'Iceberg', body: 'Show a fraction of your size to the book and refill it automatically.' },
];

// Must be a literal: Next reads segment config statically, so an imported
// constant cannot be resolved. See app/_lib/revalidate.ts for the rationale.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Buy and sell crypto',
  description:
    'Convert between 340+ assets at a routed price, fund in 46 currencies, and settle in seconds.',
};

export default async function TradePage() {
  // One read, threaded into every priced element on the page. `React.cache`
  // would dedupe repeated calls anyway, but fetching once here also makes the
  // data flow legible: everything below renders from the same observation.
  const markets = await getMarkets({ limit: 14 });


  const rows: FeatureRow[] = [
    {
      eyebrow: 'Recurring buys',
      title: 'Dollar-cost averaging that survives contact with real life',
      body: 'Set a schedule once and let it run. Daily, weekly, biweekly, or on the day your salary lands — with a pause that actually pauses instead of quietly cancelling.',
      bullets: [
        'Zero fees on recurring orders above $250',
        'Skip or resize a single instalment without touching the schedule',
        'Automatic pause if your funding source fails, with a push notification',
      ],
      icon: Repeat,
      visual: (
        <Card className="p-7">
          <p className="eyebrow mb-6">Recurring plan</p>
          <div className="space-y-4">
            {[
              { label: 'Every Friday', asset: 'BTC', amount: '$250.00' },
              { label: 'Every 1st', asset: 'ETH', amount: '$500.00' },
              { label: 'Every payday', asset: 'SOL', amount: '$120.00' },
            ].map((plan) => (
              <div
                key={plan.label}
                className="flex items-center justify-between rounded-md border border-line bg-bg-sunken/60 px-4 py-3.5"
              >
                <div>
                  <p className="text-sm font-medium text-fg">{plan.asset}</p>
                  <p className="text-xs text-fg-subtle">{plan.label}</p>
                </div>
                <p data-numeric className="text-sm text-fg-muted">
                  {plan.amount}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-fg-subtle">
            Next execution in 2 days · Total invested $18,420 · Average cost $61,204
          </p>
        </Card>
      ),
    },
    {
      eyebrow: 'Convert',
      title: 'Move between any two assets without touching cash',
      body: 'Convert routes through the deepest path across 340+ assets and quotes you a locked rate for 30 seconds. No order book to read, no two-leg trade to babysit.',
      bullets: [
        'One fee, quoted up front, with no hidden spread',
        'Locked rate honoured even if the market moves against us',
        'Available on every pair, including illiquid long-tail assets',
      ],
      icon: Shuffle,
      visual: <BuySellWidget markets={markets} defaultSlug="eth" />,
    },
    {
      eyebrow: 'Mobile',
      title: 'The same engine, in your pocket',
      body: 'Everything on this page works identically on iOS and Android, including advanced order types. Biometric approval, offline-first caching and a widget that stays honest.',
      icon: Wallet,
      visual: <PhoneMock holdings={markets} />,
    },
  ];

  return (
    <>
      <PageHero
        eyebrow="Buy & sell"
        title={
          <>
            Trade 340+ assets.
            <br />
            <span className="text-aurora">Pay almost nothing.</span>
          </>
        }
        body="One tap to convert, one account for every asset, and a fee schedule you can read in under a minute."
        align="left"
        actions={
          <>
            <ButtonLink href="/signup" size="lg" sheen>
              Start trading
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/fees" variant="outline" size="lg">
              See fees
            </ButtonLink>
          </>
        }
        aside={<BuySellWidget markets={markets} />}
      />

      <TickerStrip markets={markets} />

      <Section id="funding">
        <div className="shell">
          <SectionHeading
            eyebrow="Funding"
            title="Get money in without the wait"
            body="Local rails wherever they exist, card funding everywhere else, and on-chain deposits across 32 networks."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FUNDING.map((method) => (
              <StaggerItem key={method.title}>
                <InteractiveCard className="h-full p-6">
                  <method.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">
                    {method.title}
                  </h3>
                  <p className="mt-2 text-sm text-fg-muted">{method.detail}</p>
                  <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-fg-subtle">Fee</dt>
                      <dd className="text-fg">{method.fee}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-subtle">Speed</dt>
                      <dd className="text-fg">{method.time}</dd>
                    </div>
                  </dl>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="recurring" tone="sunken">
        <div className="shell">
          <FeatureRows rows={rows} />
        </div>
      </Section>

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Order types"
            title="Simple by default. Precise when you need it."
            body="The same order types the institutional desk uses, exposed in the same interface."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ORDER_TYPES.map((order) => (
              <StaggerItem key={order.name}>
                <InteractiveCard className="h-full p-6">
                  <h3 className="font-mono text-sm uppercase tracking-wider text-accent">
                    {order.name}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">{order.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <FaqSection />
      <CtaBand />
    </>
  );
}
