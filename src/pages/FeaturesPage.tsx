import {
  Activity, ArrowRight, Bell, Boxes, Cpu, Gauge, Globe2, KeyRound, Layers, LineChart,
  Repeat, ShieldCheck, Smartphone, Sparkles, Wallet, Zap,
} from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { FeatureRows, type FeatureRow } from '@/components/sections/FeatureRows';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { ButtonLink } from '@/design-system/primitives/Button';
import { StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { BuySellWidget } from '@/features/trade/BuySellWidget';
import { PhoneMock } from '@/components/visuals/PhoneMock';
import { Sparkline } from '@/components/visuals/Sparkline';
import { buildSpark } from '@/features/markets/simulation';
import { CountUp } from '@/design-system/primitives/CountUp';
import { useSeo } from '@/lib/seo';

const CAPABILITIES = [
  { icon: Gauge, title: 'Sub-millisecond matching', body: '0.9 ms median order-to-acknowledgement across 11 colocated regions.' },
  { icon: Boxes, title: '340+ listed assets', body: 'Every listing ships with a published risk review and liquidity commitment.' },
  { icon: LineChart, title: 'Eight order types', body: 'Market through iceberg, including TWAP slicing and trailing stops.' },
  { icon: Repeat, title: 'Recurring buys', body: 'Any cadence, any asset, with instalment-level control.' },
  { icon: Wallet, title: 'Self-custody wallet', body: 'MPC shards across three regions. No single key ever exists.' },
  { icon: ShieldCheck, title: 'Daily proof-of-reserves', body: 'Merkle root published every 24 hours, verifiable against your own balance.' },
  { icon: Globe2, title: '46 fiat currencies', body: 'Local rails in 38 markets, card funding in 180 countries.' },
  { icon: Bell, title: 'Sub-second alerts', body: 'Push delivered under 400 ms from the moment the book crosses your level.' },
  { icon: KeyRound, title: 'Passkeys and hardware 2FA', body: 'Phishing-resistant by default, with withdrawal allow-listing.' },
  { icon: Layers, title: 'REST, WebSocket and FIX', body: 'Idempotent writes, cursor pagination, 90-day deprecation windows.' },
  { icon: Cpu, title: 'Tax and reporting exports', body: 'Cost-basis reports in eight jurisdictional formats, generated on demand.' },
  { icon: Smartphone, title: 'iOS, Android and web', body: 'One account, identical capability, offline-first on mobile.' },
];

const ENGINE_SPARK = buildSpark('features-engine', 8, 44);

export default function FeaturesPage() {
  useSeo({
    title: 'Platform features',
    description:
      'Sub-millisecond matching, 340+ assets, eight order types, self-custody, daily proof-of-reserves and an API engineers enjoy.',
  });

  const rows: FeatureRow[] = [
    {
      eyebrow: 'Execution',
      title: 'The engine is the product',
      body: 'A Rust matching core with kernel-bypass networking, deployed in eleven colocated regions. Retail orders take exactly the same path as institutional flow — there is no second-tier queue.',
      bullets: [
        '0.9 ms median order-to-ack, 3.1 ms at the 99th percentile',
        '1.4 million orders per second sustained, benchmarked quarterly and published',
        'Deterministic price-time priority with no internalisation or payment for order flow',
      ],
      icon: Zap,
      visual: (
        <Card className="p-7">
          <p className="eyebrow mb-6">Engine throughput</p>
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-5xl font-semibold text-fg">
                <CountUp value={1_400_000} compact />
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-fg-subtle">orders / second</p>
            </div>
            <Sparkline data={ENGINE_SPARK} color="var(--accent)" width={190} height={72} />
          </div>
          <dl className="mt-7 grid grid-cols-3 gap-4 border-t border-line pt-5 text-center">
            {[
              { k: 'p50', v: '0.9 ms' },
              { k: 'p99', v: '3.1 ms' },
              { k: 'Uptime', v: '99.997%' },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-2xs uppercase tracking-wider text-fg-subtle">{s.k}</dt>
                <dd data-numeric className="mt-1 text-sm font-medium text-fg">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ),
    },
    {
      eyebrow: 'Conversion',
      title: 'Complexity is optional, not mandatory',
      body: 'Most people want to turn one thing into another thing. Convert quotes a locked rate for thirty seconds and routes through the deepest available path — no order book to interpret.',
      bullets: [
        'A single quoted fee with no spread markup hidden inside the rate',
        'Locked rate honoured even when the market moves against us',
        'Works on every listed pair, including the long tail',
      ],
      icon: Sparkles,
      visual: <BuySellWidget defaultAssetId="sol" />,
    },
    {
      eyebrow: 'Everywhere',
      title: 'Full capability on the small screen',
      body: 'The mobile app is not a viewer. Advanced order types, staking, self-custody transfers and reserve verification all work identically, with biometric approval and an offline-first cache.',
      icon: Activity,
      visual: <PhoneMock />,
    },
  ];

  return (
    <>
      <PageHero
        eyebrow="Platform"
        title={
          <>
            Everything the engine can do,
            <br />
            <span className="text-aurora">in one account.</span>
          </>
        }
        body="Novex is one platform for spot trading, recurring investment, staking and self-custody — built on the infrastructure institutions already trust."
        actions={
          <>
            <ButtonLink to="/signup" size="lg" sheen>
              Create free account
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink to="/developers" variant="outline" size="lg">
              Read the API docs
            </ButtonLink>
          </>
        }
      />

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Capabilities"
            title="Twelve things that matter"
            body="Not a feature list padded for a comparison table — the capabilities people actually open the app for."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap) => (
              <StaggerItem key={cap.title}>
                <Card interactive className="h-full p-6">
                  <span className="grid size-10 place-items-center rounded-md border border-line bg-surface text-brand-soft">
                    <cap.icon className="size-4.5" />
                  </span>
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{cap.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{cap.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <FeatureRows rows={rows} />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
