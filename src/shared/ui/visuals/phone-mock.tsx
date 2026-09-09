import { ArrowDownLeft, ArrowUpRight, Bell } from 'lucide-react';

import type { MarketDto } from '@/modules/market-data';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatPrice } from '@/shared/lib/format';

import { AssetMark } from './asset-mark';
import { Sparkline } from './sparkline';

/**
 * A device frame rendered entirely in DOM — no screenshots to go stale, and it
 * inherits the live theme so the mock is never off-brand.
 *
 * The holdings list is fed real market rows, so the assets, prices and moves on
 * the mock screen are the ones the site is actually quoting. The portfolio
 * total is a sample figure: it is a picture of *an* account, and there is no
 * account here to read a balance from. It is labelled as a demonstration in the
 * surrounding section copy.
 */
export function PhoneMock({
  holdings,
  className,
}: {
  holdings: readonly MarketDto[];
  className?: string;
}) {
  const shown = holdings.slice(0, 5);

  return (
    <div className={cn('relative mx-auto w-[19rem] max-w-full', className)}>
      <div className="relative rounded-[2.75rem] border border-line-strong bg-bg-elev p-2.5 shadow-float">
        <span
          aria-hidden
          className="absolute left-1/2 top-3.5 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-bg-sunken"
        />
        <div className="relative overflow-hidden rounded-[2.15rem] border border-line bg-bg">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
            <div className="aurora-field opacity-70">
              <i />
            </div>
          </div>

          <div className="relative px-5 pb-6 pt-12">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xs uppercase tracking-wider text-fg-subtle">Portfolio</p>
                <p data-numeric className="mt-1 font-display text-2xl font-semibold text-fg">
                  $184,204.18
                </p>
              </div>
              <span className="grid size-9 place-items-center rounded-full border border-line text-fg-muted">
                <Bell className="size-4" />
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <span data-numeric className="text-xs font-semibold text-up">
                +$12,860.44 (7.5%)
              </span>
              <span className="text-2xs text-fg-subtle">30d</span>
            </div>

            <div className="mt-4 rounded-lg border border-line bg-surface p-3">
              <Sparkline
                id="phone-portfolio"
                data={PORTFOLIO_SHAPE}
                color="var(--accent)"
                width={250}
                height={64}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <span className="flex items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-xs font-semibold text-on-brand">
                <ArrowDownLeft className="size-3.5" /> Buy
              </span>
              <span className="flex items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-xs font-semibold text-fg">
                <ArrowUpRight className="size-3.5" /> Sell
              </span>
            </div>

            <p className="mt-5 text-2xs uppercase tracking-wider text-fg-subtle">Holdings</p>
            <ul className="mt-2 space-y-1.5">
              {shown.map((market) => {
                const quote = market.quote;
                const up = quote.state !== 'unavailable' && quote.direction !== 'down';

                return (
                  <li
                    key={market.symbol}
                    className="flex items-center gap-2.5 rounded-md border border-transparent px-1.5 py-1.5"
                  >
                    <AssetMark
                      symbol={market.symbol}
                      glyph={market.glyph}
                      hue={market.hue}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-fg">
                        {market.name}
                      </span>
                      <span className="block text-2xs text-fg-subtle">{market.symbol}</span>
                    </span>
                    <span className="text-right">
                      <span data-numeric className="block text-xs text-fg">
                        {quote.state === 'unavailable'
                          ? '—'
                          : formatPrice(quote.price, quote.currency)}
                      </span>
                      <span
                        data-numeric
                        className={cn(
                          'block text-2xs font-semibold',
                          quote.state === 'unavailable'
                            ? 'text-fg-subtle'
                            : up
                              ? 'text-up'
                              : 'text-down',
                        )}
                      >
                        {quote.state === 'unavailable'
                          ? '—'
                          : formatPercent(quote.change24hPercent)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sample balance curve for the mock screen. A fixed illustration. */
const PORTFOLIO_SHAPE = [
  0.12, 0.18, 0.15, 0.22, 0.28, 0.25, 0.34, 0.31, 0.4, 0.46, 0.42, 0.5, 0.55, 0.51, 0.6, 0.64,
  0.61, 0.69, 0.73, 0.7, 0.78, 0.83, 0.8, 0.87, 0.92, 0.89, 0.95, 1,
];
