import type { Metadata } from 'next';
import { ArrowRight, Braces, GitBranch, Radio, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { CodeBlock, type CodeTab } from '@/shared/ui/visuals/code-block';
import { StaggerGroup, StaggerItem, Reveal } from '@/shared/ui/motion/reveal';

const TABS: CodeTab[] = [
  {
    label: 'TypeScript',
    filename: 'order.ts',
    lines: [
      { text: "import { Novex } from '@novex/sdk';", tone: 'kw' },
      { text: '' },
      { text: 'const novex = new Novex({ apiKey: process.env.NOVEX_KEY });' },
      { text: '' },
      { text: '// Post-only limit order — never crosses the spread', tone: 'comment' },
      { text: 'const order = await novex.orders.create(' },
      { text: '  {' },
      { text: "    market: 'BTC-USD',", tone: 'str' },
      { text: "    side: 'buy',", tone: 'str' },
      { text: "    type: 'limit',", tone: 'str' },
      { text: '    price: 94_800.00,', tone: 'num' },
      { text: '    size: 0.25,', tone: 'num' },
      { text: '    postOnly: true,' },
      { text: '  },' },
      { text: '  { idempotencyKey: crypto.randomUUID() },' },
      { text: ');' },
      { text: '' },
      { text: 'console.log(order.status); // "open"', tone: 'comment' },
    ],
  },
  {
    label: 'Python',
    filename: 'order.py',
    lines: [
      { text: 'from novex import Novex', tone: 'kw' },
      { text: 'import os, uuid', tone: 'kw' },
      { text: '' },
      { text: 'novex = Novex(api_key=os.environ["NOVEX_KEY"])' },
      { text: '' },
      { text: '# Post-only limit order — never crosses the spread', tone: 'comment' },
      { text: 'order = novex.orders.create(' },
      { text: '    market="BTC-USD",', tone: 'str' },
      { text: '    side="buy",', tone: 'str' },
      { text: '    type="limit",', tone: 'str' },
      { text: '    price=94_800.00,', tone: 'num' },
      { text: '    size=0.25,', tone: 'num' },
      { text: '    post_only=True,' },
      { text: '    idempotency_key=str(uuid.uuid4()),' },
      { text: ')' },
      { text: '' },
      { text: 'print(order.status)  # "open"', tone: 'comment' },
    ],
  },
  {
    label: 'WebSocket',
    filename: 'stream.ts',
    lines: [
      { text: "const ws = new WebSocket('wss://stream.novex.io/v3');", tone: 'str' },
      { text: '' },
      { text: 'ws.onopen = () => {' },
      { text: '  ws.send(JSON.stringify({' },
      { text: "    op: 'subscribe',", tone: 'str' },
      { text: "    channels: ['book.BTC-USD.10', 'trades.BTC-USD'],", tone: 'str' },
      { text: '  }));' },
      { text: '};' },
      { text: '' },
      { text: '// Snapshot first, then deltas with monotonic sequence ids', tone: 'comment' },
      { text: 'ws.onmessage = (event) => {' },
      { text: '  const msg = JSON.parse(event.data);' },
      { text: "  if (msg.type === 'snapshot') book.reset(msg.data);", tone: 'str' },
      { text: "  if (msg.type === 'delta') book.apply(msg.data);", tone: 'str' },
      { text: '};' },
    ],
  },
  {
    label: 'cURL',
    filename: 'order.sh',
    lines: [
      { text: 'curl -X POST https://api.novex.io/v3/orders \\', tone: 'fn' },
      { text: '  -H "Authorization: Bearer $NOVEX_KEY" \\' },
      { text: '  -H "Idempotency-Key: $(uuidgen)" \\' },
      { text: '  -H "Content-Type: application/json" \\' },
      { text: "  -d '{" },
      { text: '    "market": "BTC-USD",', tone: 'str' },
      { text: '    "side": "buy",', tone: 'str' },
      { text: '    "type": "limit",', tone: 'str' },
      { text: '    "price": "94800.00",', tone: 'num' },
      { text: '    "size": "0.25",', tone: 'num' },
      { text: '    "postOnly": true' },
      { text: "  }'" },
    ],
  },
];

const PRINCIPLES = [
  { icon: ShieldCheck, title: 'Idempotency on every write', body: 'Every mutating endpoint accepts an idempotency key and honours it for 24 hours. Retries are safe by construction, not by convention.' },
  { icon: GitBranch, title: '90-day deprecation windows', body: 'Nothing breaks without three months of notice, a public changelog entry, and a deprecation header on every affected response.' },
  { icon: Radio, title: 'Sequenced streams', body: 'Snapshot then deltas, with monotonic sequence ids and an explicit gap signal so your book can never silently diverge.' },
  { icon: Zap, title: 'Honest rate limits', body: 'Token bucket, headers on every response, and a documented burst allowance. No shadow throttling.' },
  { icon: Braces, title: 'Cursor pagination everywhere', body: 'Opaque cursors, never offsets. Your pagination cannot skip or duplicate rows when the underlying data moves.' },
  { icon: Terminal, title: 'Sandbox that matches prod', body: 'The sandbox runs the same engine build with synthetic liquidity. Behaviour differences are treated as bugs.' },
];

const ENDPOINTS = [
  { method: 'GET', path: '/v3/markets', note: 'Listed markets, tick sizes and status' },
  { method: 'GET', path: '/v3/markets/{id}/book', note: 'Aggregated depth to any level' },
  { method: 'POST', path: '/v3/orders', note: 'Create an order (idempotent)' },
  { method: 'DELETE', path: '/v3/orders/{id}', note: 'Cancel by id or client id' },
  { method: 'GET', path: '/v3/fills', note: 'Fill history with cursor pagination' },
  { method: 'POST', path: '/v3/transfers', note: 'Move between accounts and wallet' },
];

const METHOD_TONE = { GET: 'accent', POST: 'up', DELETE: 'down' } as const;

export const metadata: Metadata = {
  title: 'Developers & API',
  description:
    'REST, WebSocket and FIX 4.4 access with published rate limits and versioned schemas.',
};

export default function DevelopersPage() {

  return (
    <>
      <PageHero
        eyebrow="Developers"
        title={
          <>
            An API written by people
            <br />
            <span className="text-aurora">who have been paged.</span>
          </>
        }
        body="REST for state, WebSocket for streams, FIX 4.4 for the desks that insist. Idempotency keys on every mutation and a changelog that tells you before something changes."
        align="left"
        actions={
          <>
            <ButtonLink href="/signup" size="lg" sheen>
              Get an API key
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/institutional" variant="outline" size="lg">
              FIX connectivity
            </ButtonLink>
          </>
        }
        aside={<CodeBlock tabs={TABS} />}
      />

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Design principles"
            title="Six decisions we will not revisit"
            body="Every one of these exists because somebody on this team got woken up by its absence at a previous job."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <StaggerItem key={principle.title}>
                <InteractiveCard className="h-full p-6">
                  <principle.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">
                    {principle.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{principle.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Reference"
            title="The endpoints you will use on day one"
            body="Full OpenAPI 3.1 specification, generated SDKs for six languages, and a Postman collection that actually stays current."
            className="lg:sticky lg:top-28"
          >
            <ButtonLink href="/contact" variant="outline">
              Request sandbox access
            </ButtonLink>
          </SectionHeading>

          <Reveal delay={0.1}>
            <Card edge={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {ENDPOINTS.map((endpoint) => (
                  <li
                    key={endpoint.path + endpoint.method}
                    className="flex flex-wrap items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-hover"
                  >
                    <Badge tone={METHOD_TONE[endpoint.method as keyof typeof METHOD_TONE]}>
                      {endpoint.method}
                    </Badge>
                    <code className="font-mono text-sm text-fg">{endpoint.path}</code>
                    <span className="ml-auto text-xs text-fg-subtle">{endpoint.note}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { k: 'Rate limit', v: '600 req/min' },
                { k: 'Burst', v: '100 req/s' },
                { k: 'WS channels', v: '400 per key' },
              ].map((item) => (
                <Card key={item.k} className="p-5 text-center">
                  <p data-numeric className="font-display text-xl font-semibold text-fg">
                    {item.v}
                  </p>
                  <p className="mt-1 text-2xs uppercase tracking-wider text-fg-subtle">{item.k}</p>
                </Card>
              ))}
            </div>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        title="Build against the sandbox tonight."
        body="Same engine build, synthetic liquidity, no KYC required to start. Keys are issued instantly."
        primary={{ label: 'Create an account', href: '/signup' }}
        secondary={{ label: 'Talk to an engineer', href: '/contact' }}
      />
    </>
  );
}
