import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section } from '@/design-system/primitives/Section';
import { MarketTable } from '@/features/markets/MarketTable';
import { TickerStrip } from '@/features/markets/TickerStrip';
import { Card } from '@/design-system/primitives/Card';
import { StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { AssetMark } from '@/components/visuals/AssetMark';
import { ASSETS } from '@/features/markets/assets';
import { formatPercent } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';
import { Link } from 'react-router-dom';
import { Flame, TrendingDown, TrendingUp } from 'lucide-react';

const MOVERS = {
  gainers: [...ASSETS].sort((a, b) => b.change24h - a.change24h).slice(0, 4),
  losers: [...ASSETS].sort((a, b) => a.change24h - b.change24h).slice(0, 4),
  volume: [...ASSETS].sort((a, b) => b.volume24h - a.volume24h).slice(0, 4),
};

function MoverCard({
  title,
  icon: Icon,
  assets,
}: {
  title: string;
  icon: typeof Flame;
  assets: typeof ASSETS;
}) {
  return (
    <Card interactive className="p-6">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-fg">
        <Icon className="size-4 text-brand-soft" />
        {title}
      </h2>
      <ul className="mt-5 space-y-1">
        {assets.map((asset) => {
          const up = asset.change24h >= 0;
          return (
            <li key={asset.id}>
              <Link
                to={`/markets/${asset.id}`}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{asset.name}</span>
                <span
                  data-numeric
                  className={cn('text-sm font-semibold', up ? 'text-up' : 'text-down')}
                >
                  {formatPercent(asset.change24h)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function MarketsPage() {
  useSeo({
    title: 'Crypto prices & markets',
    description:
      'Live prices, 24-hour movement and depth for 340+ digital assets on the Novex order book.',
  });

  return (
    <>
      <PageHero
        eyebrow="Markets"
        title={
          <>
            Every price, <span className="text-aurora">live.</span>
          </>
        }
        body="Streamed straight from the Novex matching engine — the same book institutions trade on, with no delayed feed and no aggregator in between."
      />

      <TickerStrip />

      <Section>
        <div className="shell">
          <StaggerGroup className="grid gap-4 lg:grid-cols-3">
            <StaggerItem>
              <MoverCard title="Top gainers, 24h" icon={TrendingUp} assets={MOVERS.gainers} />
            </StaggerItem>
            <StaggerItem>
              <MoverCard title="Top losers, 24h" icon={TrendingDown} assets={MOVERS.losers} />
            </StaggerItem>
            <StaggerItem>
              <MoverCard title="Most traded" icon={Flame} assets={MOVERS.volume} />
            </StaggerItem>
          </StaggerGroup>

          <h2 className="mt-20 text-3xl font-semibold">All markets</h2>
          <p className="mt-3 max-w-xl text-fg-muted">
            Sort by any column, filter by sector, or search the full catalogue.
          </p>
          <MarketTable className="mt-8" />
        </div>
      </Section>

      <CtaBand
        title="Pick an asset. Place your first order."
        body="Open an account and trade any market on this page in under two minutes."
      />
    </>
  );
}
