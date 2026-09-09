import Link from 'next/link';
import { ArrowRight, Boxes, Gauge, Globe2, KeyRound, Layers, LineChart } from 'lucide-react';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { Sparkline } from '@/shared/ui/visuals/sparkline';
import { CountUp } from '@/shared/ui/primitives/count-up';
import { cn } from '@/shared/lib/cn';
import { Glow } from '@/shared/ui/visuals/aurora';

/**
 * Throughput illustration for the engine tile.
 *
 * A fixed curve, not a generated one. It sits beside an orders-per-second
 * figure, so it illustrates capacity rather than reporting a price — and being
 * a constant, it renders identically on the server and the client and never
 * implies data we do not have.
 */
const ENGINE_SPARK = [
  0.18, 0.24, 0.21, 0.3, 0.36, 0.32, 0.41, 0.38, 0.47, 0.52, 0.48, 0.57, 0.62, 0.58, 0.66,
  0.71, 0.68, 0.74, 0.79, 0.76, 0.83, 0.88, 0.85, 0.91, 0.95, 0.92, 0.97, 1,
];

function Tile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <StaggerItem className={className}>
      <InteractiveCard className="h-full p-7">
        {children}
      </InteractiveCard>
    </StaggerItem>
  );
}

function Header({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Gauge;
  title: string;
  body: string;
}) {
  return (
    <>
      <span className="mb-5 grid size-11 place-items-center rounded-md border border-line bg-surface text-brand-soft">
        <Icon className="size-5" />
      </span>
      <h3 className="font-display text-xl font-semibold text-fg">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{body}</p>
    </>
  );
}

export function BentoFeatures() {
  return (
    <Section id="platform" className="overflow-hidden">
      <Glow className="-top-20 left-1/2 -translate-x-1/2" size={860} opacity={0.22} />
      <div className="shell">
        <SectionHeading
          eyebrow="The platform"
          title={
            <>
              Everything a serious trader needs.
              <br className="hidden sm:block" /> Nothing they don&apos;t.
            </>
          }
          body="One account for spot, recurring buys, staking and self-custody — wired into the same order book that institutions trade on."
        />

        <StaggerGroup className="mt-16 grid gap-4 md:grid-cols-6">
          {/* Engine — hero tile */}
          <Tile className="md:col-span-4">
            <Header
              icon={Gauge}
              title="A matching engine built for conviction"
              body="Rust core, kernel-bypass networking and colocated match in 11 regions. Median order-to-ack is 0.9 ms — the same path institutional desks take."
            />
            <div className="mt-7 rounded-lg border border-line bg-bg-sunken/60 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-fg-subtle">Orders / second</p>
                  <p className="mt-1 font-display text-4xl font-semibold text-fg">
                    <CountUp value={1_400_000} compact />
                  </p>
                </div>
                <Sparkline id="engine-throughput" data={ENGINE_SPARK} color="var(--accent)" width={160} height={54} />
              </div>
            </div>
          </Tile>

          {/* Assets */}
          <Tile className="md:col-span-2">
            <Header
              icon={Boxes}
              title="340+ assets"
              body="Majors, L2s, RWAs and the long tail — listed only after a published risk review."
            />
            <div className="mt-6 flex flex-wrap gap-1.5">
              {['BTC', 'ETH', 'SOL', 'ARB', 'TAO', 'ONDO', 'INJ', 'LINK', '+332'].map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-line px-2.5 py-1 font-mono text-2xs text-fg-muted"
                >
                  {s}
                </span>
              ))}
            </div>
          </Tile>

          {/* Custody */}
          <Tile className="md:col-span-2">
            <Header
              icon={KeyRound}
              title="Keys you actually hold"
              body="MPC shards across three regions. Novex never assembles a full private key — not even to sign."
            />
          </Tile>

          {/* Fees */}
          <Tile className="md:col-span-2">
            <Header
              icon={LineChart}
              title="Maker rebates from −0.005%"
              body="Volume tiers recalculate every hour, not every month. You get the better rate immediately."
            />
            <Link
              href="/fees"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-soft transition-colors hover:text-accent"
            >
              See the fee schedule
              <ArrowRight className="size-3.5" />
            </Link>
          </Tile>

          {/* Global */}
          <Tile className="md:col-span-2">
            <Header
              icon={Globe2}
              title="46 currencies, 180 countries"
              body="Local rails where they exist — SEPA, FPS, PIX, NIP — and card funding everywhere else."
            />
          </Tile>

          {/* API */}
          <Tile className="md:col-span-6">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <Header
                  icon={Layers}
                  title="An API your engineers will actually enjoy"
                  body="REST for state, WebSocket for streams, FIX 4.4 for the desks that insist. Idempotency keys on every mutation, cursor pagination everywhere, and a public changelog with 90-day deprecation windows."
                />
                <Link
                  href="/developers"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-soft transition-colors hover:text-accent"
                >
                  Read the docs
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <CodeCard />
            </div>
          </Tile>
        </StaggerGroup>
      </div>
    </Section>
  );
}

const CODE_LINES: { text: string; tone?: 'key' | 'str' | 'num' | 'comment' | 'fn' }[] = [
  { text: '// Place a post-only limit order', tone: 'comment' },
  { text: 'const order = await novex.orders.create({' },
  { text: "  market: 'BTC-USD',", tone: 'str' },
  { text: "  side: 'buy',", tone: 'str' },
  { text: "  type: 'limit',", tone: 'str' },
  { text: '  price: 94_800.00,', tone: 'num' },
  { text: '  size: 0.25,', tone: 'num' },
  { text: '  timeInForce: "GTC",', tone: 'str' },
  { text: '  postOnly: true,' },
  { text: '}, { idempotencyKey: uuid() });' },
  { text: '' },
  { text: 'order.status; // => "open"', tone: 'comment' },
];

function CodeCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg-sunken/80 font-mono text-xs">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="size-2.5 rounded-full bg-down/70" />
        <span className="size-2.5 rounded-full bg-warn/70" />
        <span className="size-2.5 rounded-full bg-up/70" />
        <span className="ml-2 text-2xs text-fg-subtle">order.ts</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 leading-relaxed">
        <code>
          {CODE_LINES.map((line, i) => (
            <span
              key={i}
              className={cn(
                'block',
                line.tone === 'comment' && 'text-fg-subtle',
                line.tone === 'str' && 'text-up',
                line.tone === 'num' && 'text-accent',
                !line.tone && 'text-fg-muted',
              )}
            >
              {line.text || ' '}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
