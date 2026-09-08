import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ASSET_BY_ID } from '@/features/markets/assets';
import { useLiveQuotes } from '@/features/markets/useMarkets';
import { AssetMark } from '@/components/visuals/AssetMark';
import { Sparkline } from '@/components/visuals/Sparkline';
import { Aurora, Glow } from '@/components/visuals/Aurora';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Section } from '@/design-system/primitives/Section';
import { BuySellWidget } from '@/features/trade/BuySellWidget';
import { MarketTable } from '@/features/markets/MarketTable';
import { CtaBand } from '@/components/sections/CtaBand';
import { Reveal } from '@/design-system/motion/Reveal';
import { formatCompact, formatPercent, formatPrice, formatQuantity } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';

export default function AssetPage() {
  const { assetId = 'btc' } = useParams();
  const asset = ASSET_BY_ID.get(assetId);
  const quotes = useLiveQuotes(asset ? [asset] : []);
  const quote = quotes[0];

  useSeo({
    title: asset ? `${asset.name} (${asset.symbol}) price` : 'Asset not found',
    description: asset
      ? `Live ${asset.name} price, market cap, volume and 7-day chart. Buy ${asset.symbol} on Novex with fees from 0.00%.`
      : 'This market is not listed on Novex.',
    noindex: !asset,
  });

  if (!asset || !quote) {
    return (
      <Section>
        <div className="shell max-w-lg text-center">
          <h1 className="text-4xl font-semibold">Market not listed</h1>
          <p className="mt-4 text-fg-muted">
            We could not find an asset with the identifier “{assetId}”.
          </p>
          <ButtonLink to="/markets" className="mt-8">
            Browse all markets
          </ButtonLink>
        </div>
      </Section>
    );
  }

  const up = quote.change24h >= 0;
  const stats = [
    { label: 'Market cap', value: formatCompact(asset.marketCap, 'USD') },
    { label: '24h volume', value: formatCompact(asset.volume24h, 'USD') },
    { label: 'Circulating supply', value: `${formatCompact(asset.supply)} ${asset.symbol}` },
    { label: '7d change', value: formatPercent(asset.change7d) },
    { label: 'Sector', value: asset.category },
    { label: 'Staking APY', value: asset.apy ? `${asset.apy.toFixed(1)}%` : 'Not available' },
  ];

  return (
    <>
      <section className="relative isolate -mt-18 overflow-hidden pb-16 pt-32 md:pt-40">
        <Aurora grid />
        <Glow className="-top-10 right-0" size={520} opacity={0.3} color={asset.hue} />

        <div className="shell">
          <Reveal>
            <Link
              to="/markets"
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
                  <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} size="lg" />
                  <div>
                    <h1 className="text-4xl font-semibold">{asset.name}</h1>
                    <p className="mt-1 font-mono text-sm uppercase tracking-wider text-fg-subtle">
                      {asset.symbol} · {asset.category}
                    </p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <div className="mt-8 flex flex-wrap items-end gap-4">
                  <span data-numeric className="font-display text-5xl font-semibold text-fg">
                    {formatPrice(quote.live)}
                  </span>
                  <Badge tone={up ? 'up' : 'down'} className="mb-2">
                    {formatPercent(quote.change24h)} 24h
                  </Badge>
                </div>
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-fg-muted">{asset.blurb}</p>
              </Reveal>

              <Reveal delay={0.14}>
                <Card className="mt-8 p-6">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow">7-day trend</p>
                    <span
                      data-numeric
                      className={cn(
                        'text-sm font-semibold',
                        asset.change7d >= 0 ? 'text-up' : 'text-down',
                      )}
                    >
                      {formatPercent(asset.change7d)}
                    </span>
                  </div>
                  <div className="mt-5">
                    <Sparkline
                      data={quote.spark}
                      positive={asset.change7d >= 0}
                      width={760}
                      height={190}
                      strokeWidth={2.25}
                      className="w-full"
                    />
                  </div>
                </Card>
              </Reveal>

              <Reveal delay={0.18}>
                <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
                  {stats.map((stat) => (
                    <div key={stat.label} className="bg-bg-elev px-5 py-5">
                      <dt className="text-2xs uppercase tracking-wider text-fg-subtle">
                        {stat.label}
                      </dt>
                      <dd data-numeric className="mt-1.5 text-sm font-medium text-fg">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>

            <Reveal delay={0.12} className="lg:sticky lg:top-28">
              <BuySellWidget defaultAssetId={asset.id} />
              <p className="mt-5 text-center text-xs text-fg-subtle">
                1 {asset.symbol} ≈ {formatQuantity(1 / quote.live, 8)} USD-inverse · Updated live
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <Section tone="sunken">
        <div className="shell">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold">Other markets</h2>
            <ButtonLink to="/markets" variant="outline" size="sm">
              View all
              <ArrowRight className="size-3.5" />
            </ButtonLink>
          </div>
          <MarketTable limit={6} showControls={false} />
        </div>
      </Section>

      <CtaBand
        title={`Buy ${asset.name} in 90 seconds.`}
        body={`Open a free Novex account and take your first ${asset.symbol} position with fees from 0.00%.`}
      />
    </>
  );
}
