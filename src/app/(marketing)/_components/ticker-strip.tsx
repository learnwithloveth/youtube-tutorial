import Link from 'next/link';

import type { MarketDto } from '@/modules/market-data';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatPrice } from '@/shared/lib/format';
import { Marquee } from '@/shared/ui/primitives/marquee';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';

/**
 * Always-on price rail.
 *
 * A Server Component that takes rows as a prop. The design drove this from a
 * client-side interval that jittered prices every 1.5s; the movement was
 * generated, not observed. Rendering real observations on the server means the
 * strip is HTML — no bundle, no hydration — and every figure on it is one the
 * feed actually reported.
 *
 * Rows with no quote are skipped rather than shown blank: this rail is
 * decorative, and the market table below is where an unpriced asset must still
 * be accounted for.
 */
export function TickerStrip({
  markets,
  className,
}: {
  markets: readonly MarketDto[];
  className?: string;
}) {
  const priced = markets.filter((market) => market.quote.state !== 'unavailable');
  if (priced.length === 0) return null;

  return (
    <div className={cn('border-y border-line bg-bg-sunken/40 py-3', className)}>
      <Marquee durationSec={62}>
        <div className="flex items-center gap-3 pr-3">
          {priced.map((market) => {
            const quote = market.quote;
            if (quote.state === 'unavailable') return null;
            const up = quote.direction !== 'down';

            return (
              <Link
                key={market.symbol}
                href={`/markets/${market.slug}`}
                className="group flex items-center gap-3 rounded-full border border-transparent px-4 py-2 transition-colors duration-300 hover:border-line hover:bg-surface"
              >
                <AssetMark
                  symbol={market.symbol}
                  glyph={market.glyph}
                  hue={market.hue}
                  size="sm"
                />
                <span className="text-sm font-medium text-fg">{market.symbol}</span>
                <span data-numeric className="text-sm text-fg-muted">
                  {formatPrice(quote.price, quote.currency)}
                </span>
                <span
                  data-numeric
                  className={cn('text-xs font-semibold', up ? 'text-up' : 'text-down')}
                >
                  {formatPercent(quote.change24hPercent)}
                </span>
                {quote.sparkline ? (
                  <Sparkline
                    id={`ticker-${market.symbol}`}
                    data={quote.sparkline}
                    positive={up}
                    width={56}
                    height={20}
                    filled={false}
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      </Marquee>
    </div>
  );
}
