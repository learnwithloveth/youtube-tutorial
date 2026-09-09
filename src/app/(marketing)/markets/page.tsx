import { Flame, TrendingDown, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import type { MarketDto } from '@/modules/market-data';
import { getMarkets } from '@/server/market-data';
import { cn } from '@/shared/lib/cn';
import { compareNullableDecimals } from '@/shared/lib/compare';
import { formatPercent } from '@/shared/lib/format';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Section } from '@/shared/ui/primitives/section';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';

import { MarketTable } from '../_components/market-table';
import { CtaBand } from '../_components/sections/cta-band';
import { PageHero } from '../_components/sections/page-hero';
import { TickerStrip } from '../_components/ticker-strip';

// Must be a literal: Next reads segment config statically, so an imported
// constant cannot be resolved. See app/_lib/revalidate.ts for the rationale.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Markets',
  description:
    'Prices, 24-hour moves and volume across every asset listed on Novex, with the time each quote was observed.',
};

export default function MarketsPage() {
  return (
    <>
      <PageHero
        eyebrow="Markets"
        title={
          <>
            Every price, <span className="text-aurora">in one place.</span>
          </>
        }
        /* The design claimed these came "straight from the Novex matching
           engine … with no aggregator in between". They come from a market
           data provider, so the copy says that instead. */
        body="Every listed asset, quoted from live market data and stamped with the moment each price was observed."
      />

      <Suspense fallback={null}>
        <PricedTicker />
      </Suspense>

      <Section>
        <div className="shell">
          <Suspense fallback={<MoversFallback />}>
            <Movers />
          </Suspense>

          <h2 className="mt-20 text-3xl font-semibold">All markets</h2>
          <p className="mt-3 max-w-xl text-fg-muted">
            Sort by any column, filter by sector, or search the full catalogue.
          </p>

          <Suspense fallback={<TableFallback />}>
            <FullTable />
          </Suspense>
        </div>
      </Section>

      <CtaBand
        title="Pick an asset. Place your first order."
        body="Open an account and trade any market on this page in under two minutes."
      />
    </>
  );
}

async function PricedTicker() {
  const markets = await getMarkets({ limit: 14 });
  return <TickerStrip markets={markets} />;
}

async function FullTable() {
  const markets = await getMarkets();
  return <MarketTable className="mt-8" markets={markets} />;
}

async function Movers() {
  const markets = await getMarkets();
  const priced = markets.filter((market) => market.quote.state !== 'unavailable');

  const byChange = [...priced].sort((a, b) => changeOf(a) - changeOf(b));
  const byVolume = [...priced].sort((a, b) =>
    compareNullableDecimals(volumeOf(b), volumeOf(a)),
  );

  return (
    <StaggerGroup className="grid gap-4 lg:grid-cols-3">
      <StaggerItem>
        <MoverCard
          title="Top gainers, 24h"
          icon={TrendingUp}
          markets={[...byChange].reverse().slice(0, 4)}
        />
      </StaggerItem>
      <StaggerItem>
        <MoverCard title="Top losers, 24h" icon={TrendingDown} markets={byChange.slice(0, 4)} />
      </StaggerItem>
      <StaggerItem>
        <MoverCard title="Most traded" icon={Flame} markets={byVolume.slice(0, 4)} />
      </StaggerItem>
    </StaggerGroup>
  );
}

function MoverCard({
  title,
  icon: Icon,
  markets,
}: {
  title: string;
  icon: typeof Flame;
  markets: readonly MarketDto[];
}) {
  return (
    <InteractiveCard className="p-6">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-fg">
        <Icon className="size-4 text-brand-soft" />
        {title}
      </h2>
      <ul className="mt-5 space-y-1">
        {markets.map((market) => {
          const change = changeOf(market);
          return (
            <li key={market.symbol}>
              <Link
                href={`/markets/${market.slug}`}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <AssetMark
                  symbol={market.symbol}
                  glyph={market.glyph}
                  hue={market.hue}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{market.name}</span>
                <span
                  data-numeric
                  className={cn('text-sm font-semibold', change >= 0 ? 'text-up' : 'text-down')}
                >
                  {formatPercent(change)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {markets.length === 0 ? (
        <p className="mt-4 text-sm text-fg-subtle">No quotes available right now.</p>
      ) : null}
    </InteractiveCard>
  );
}

function changeOf(market: MarketDto): number {
  return market.quote.state === 'unavailable' ? 0 : market.quote.change24hPercent;
}

function volumeOf(market: MarketDto): string | null {
  return market.quote.state === 'unavailable' ? null : market.quote.volume24h;
}

function MoversFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
      ))}
    </div>
  );
}

function TableFallback() {
  return (
    <div
      className="mt-8 h-96 animate-pulse rounded-lg border border-line bg-surface"
      aria-busy="true"
    />
  );
}
