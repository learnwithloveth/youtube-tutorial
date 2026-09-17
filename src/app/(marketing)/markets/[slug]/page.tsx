import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { BRAND } from '@/modules/content';
import { BasisPoints, Money } from '@/shared/kernel';
import { estimateConversion, type MarketDto, type QuoteDto } from '@/modules/market-data';
import { getInstruments, getMarket, getMarkets } from '@/server/market-data';
import { cn } from '@/shared/lib/cn';
import {
  formatAge,
  formatCompact,
  formatPercent,
  formatPrice,
  formatQuantity,
} from '@/shared/lib/format';
import { Reveal } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Card } from '@/shared/ui/primitives/card';
import { Section } from '@/shared/ui/primitives/section';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Aurora, Glow } from '@/shared/ui/visuals/aurora';
import { Sparkline } from '@/shared/ui/visuals/sparkline';

import { BuySellWidget } from '../../_components/buy-sell-widget';
import { MarketTable } from '../../_components/market-table';
import { CtaBand } from '../../_components/sections/cta-band';

// Must be a literal: Next reads segment config statically, so an imported
// constant cannot be resolved. See app/_lib/revalidate.ts for the rationale.
export const revalidate = 60;

/**
 * Asset detail.
 *
 * `generateStaticParams` enumerates the catalogue at build time, so every listed
 * asset gets a prerendered page rather than being rendered on first request. The
 * list comes from the instrument repository — the same source the markets table
 * uses — so a new listing produces a new page without anyone maintaining a
 * second list of routes.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const instruments = await getInstruments();
  return instruments.map((instrument) => ({ slug: instrument.slug }));
}

/** In Next 16 `params` is a Promise and must be awaited. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const market = await getMarket(slug);

  if (!market) {
    return { title: 'Market not listed', robots: { index: false, follow: false } };
  }

  return {
    title: `${market.name} (${market.symbol}) price`,
    description: `${market.name} price, market cap, volume and 7-day trend. Buy ${market.symbol} on ${BRAND.name} with fees from 0.00%.`,
    alternates: { canonical: `/markets/${market.slug}` },
  };
}

export default async function AssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = await getMarket(slug);

  // An unlisted slug is a 404, not an empty page. The design rendered its own
  // "market not listed" panel with a 200, which tells a crawler the URL is real.
  if (!market) notFound();

  const quote = market.quote;

  return (
    <>
      <section className="relative isolate -mt-18 overflow-hidden pb-16 pt-32 md:pt-40">
        <Aurora grid />
        <Glow className="-top-10 right-0" size={520} opacity={0.3} color={market.hue} />

        <div className="shell">
          <Reveal>
            <Link
              href="/markets"
              className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-3.5" />
              All markets
            </Link>
          </Reveal>

          <div className="mt-8 grid items-start gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Reveal>
                <div className="flex items-center gap-4">
                  <AssetMark
                    symbol={market.symbol}
                    glyph={market.glyph}
                    hue={market.hue}
                    size="lg"
                  />
                  <div>
                    <h1 className="text-4xl font-semibold">{market.name}</h1>
                    <p className="mt-1 font-mono text-sm uppercase tracking-wider text-fg-subtle">
                      {market.symbol} · {market.category}
                    </p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <PriceHeadline quote={quote} />
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-fg-muted">
                  {market.blurb}
                </p>
              </Reveal>

              <Reveal delay={0.14}>
                <TrendCard market={market} />
              </Reveal>

              <Reveal delay={0.18}>
                <StatsGrid market={market} />
              </Reveal>
            </div>

            <Reveal delay={0.12} className="lg:sticky lg:top-28">
              <BuySellWidget markets={[market]} defaultSlug={market.slug} />
              <InverseRate market={market} />
            </Reveal>
          </div>
        </div>
      </section>

      <Section tone="sunken">
        <div className="shell">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold">Other markets</h2>
            <ButtonLink href="/markets" variant="outline" size="sm">
              View all
              <ArrowRight className="size-3.5" />
            </ButtonLink>
          </div>
          <Suspense fallback={<TableFallback />}>
            <OtherMarkets excludeSlug={market.slug} />
          </Suspense>
        </div>
      </Section>

      <CtaBand
        title={`Buy ${market.name} in 90 seconds.`}
        body={`Open a free ${BRAND.name} account and take your first ${market.symbol} position with fees from 0.00%.`}
      />
    </>
  );
}

function PriceHeadline({ quote }: { quote: QuoteDto }) {
  if (quote.state === 'unavailable') {
    return (
      <div className="mt-8">
        <span className="font-display text-5xl font-semibold text-fg-subtle">—</span>
        <p className="mt-3 text-sm text-fg-muted">
          No recent price observation for this market. It returns as soon as the feed does.
        </p>
      </div>
    );
  }

  const up = quote.direction !== 'down';

  return (
    <>
      <div className="mt-8 flex flex-wrap items-end gap-4">
        <span data-numeric className="font-display text-5xl font-semibold text-fg">
          {formatPrice(quote.price, quote.currency)}
        </span>
        <Badge tone={up ? 'up' : 'down'} className="mb-2">
          {formatPercent(quote.change24hPercent)} 24h
        </Badge>
        {quote.state === 'stale' && quote.ageSeconds !== null ? (
          <Badge tone="warn" className="mb-2">
            Delayed · observed {formatAge(quote.ageSeconds)}
          </Badge>
        ) : null}
      </div>
    </>
  );
}

function TrendCard({ market }: { market: MarketDto }) {
  const quote = market.quote;
  if (quote.state === 'unavailable' || !quote.sparkline) return null;

  const up = quote.change7dPercent >= 0;

  return (
    <Card className="mt-8 p-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow">7-day trend</p>
        <span data-numeric className={cn('text-sm font-semibold', up ? 'text-up' : 'text-down')}>
          {formatPercent(quote.change7dPercent)}
        </span>
      </div>
      <div className="mt-5">
        <Sparkline
          id={`asset-${market.symbol}`}
          data={quote.sparkline}
          positive={up}
          width={760}
          height={190}
          strokeWidth={2.25}
          className="w-full"
        />
      </div>
    </Card>
  );
}

function StatsGrid({ market }: { market: MarketDto }) {
  const quote = market.quote;
  const priced = quote.state !== 'unavailable';

  const stats = [
    {
      label: 'Market cap',
      value: priced && quote.marketCap ? formatCompact(quote.marketCap, 'USD') : '—',
    },
    {
      label: '24h volume',
      value: priced && quote.volume24h ? formatCompact(quote.volume24h, 'USD') : '—',
    },
    {
      label: 'Circulating supply',
      value:
        priced && quote.circulatingSupply
          ? `${formatCompact(quote.circulatingSupply)} ${market.symbol}`
          : '—',
    },
    { label: '7d change', value: priced ? formatPercent(quote.change7dPercent) : '—' },
    { label: 'Sector', value: market.category },
    {
      label: 'Staking APY',
      value: market.yieldPercent ? `${market.yieldPercent.toFixed(1)}%` : 'Not available',
    },
  ];

  return (
    <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-bg-elev px-5 py-5">
          <dt className="text-2xs uppercase tracking-wider text-fg-subtle">{stat.label}</dt>
          <dd data-numeric className="mt-1.5 text-sm font-medium text-fg">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * How much of the asset one dollar buys.
 *
 * The design computed `1 / price` as a float and labelled it "1 BTC ≈ … USD-inverse",
 * which is the reciprocal described backwards. The figure is what a dollar buys,
 * so it now says that, and it is divided exactly rather than in floating point.
 */
function InverseRate({ market }: { market: MarketDto }) {
  const quote = market.quote;
  if (quote.state === 'unavailable') return null;

  const scale = quote.price.split('.')[1]?.length ?? 0;
  const perDollar = estimateConversion(
    Money.fromDecimalString('1.00', quote.currency, 2),
    Money.fromDecimalString(quote.price, quote.currency, scale),
    BasisPoints.zero(),
  );

  return (
    <p className="mt-5 text-center text-xs text-fg-subtle">
      1 {quote.currency} ≈ {formatQuantity(perDollar.units, 8)} {market.symbol}
      {quote.state === 'live' ? ' · observed just now' : ''}
    </p>
  );
}

async function OtherMarkets({ excludeSlug }: { excludeSlug: string }) {
  const markets = await getMarkets();
  return (
    <MarketTable
      markets={markets.filter((market) => market.slug !== excludeSlug)}
      limit={6}
      showControls={false}
    />
  );
}

function TableFallback() {
  return <div className="h-80 animate-pulse rounded-lg border border-line bg-surface" aria-busy="true" />;
}
