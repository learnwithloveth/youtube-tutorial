import { Link } from 'react-router-dom';
import { ASSETS } from './assets';
import { useLiveQuotes } from './useMarkets';
import { AssetMark } from '@/components/visuals/AssetMark';
import { Sparkline } from '@/components/visuals/Sparkline';
import { Marquee } from '@/design-system/primitives/Marquee';
import { formatPercent, formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Always-on price rail. Purely decorative to AT — the table below is the data. */
export function TickerStrip({ className }: { className?: string }) {
  const quotes = useLiveQuotes(ASSETS.slice(0, 14));

  return (
    <div className={cn('border-y border-line bg-bg-sunken/40 py-3', className)}>
      <Marquee durationSec={62}>
        <div className="flex items-center gap-3 pr-3">
          {quotes.map((q) => {
            const up = q.change24h >= 0;
            return (
              <Link
                key={q.id}
                to={`/markets/${q.id}`}
                className="group flex items-center gap-3 rounded-full border border-transparent px-4 py-2 transition-colors duration-300 hover:border-line hover:bg-surface"
              >
                <AssetMark symbol={q.symbol} glyph={q.glyph} hue={q.hue} size="sm" />
                <span className="text-sm font-medium text-fg">{q.symbol}</span>
                <span data-numeric className="text-sm text-fg-muted">
                  {formatPrice(q.live)}
                </span>
                <span
                  data-numeric
                  className={cn('text-xs font-semibold', up ? 'text-up' : 'text-down')}
                >
                  {formatPercent(q.change24h)}
                </span>
                <Sparkline data={q.spark} positive={up} width={56} height={20} filled={false} />
              </Link>
            );
          })}
        </div>
      </Marquee>
    </div>
  );
}
