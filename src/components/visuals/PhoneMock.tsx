import { ArrowDownLeft, ArrowUpRight, Bell } from 'lucide-react';
import { ASSETS } from '@/features/markets/assets';
import { AssetMark } from './AssetMark';
import { Sparkline } from './Sparkline';
import { buildSpark } from '@/features/markets/simulation';
import { formatPercent, formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';

const HOLDINGS = ASSETS.slice(0, 5);
const PORTFOLIO_SPARK = buildSpark('portfolio', 9, 44);

/**
 * A device frame rendered entirely in DOM — no screenshots to go stale, and it
 * inherits the live theme so the mock is never off-brand.
 */
export function PhoneMock({ className }: { className?: string }) {
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
              <Sparkline data={PORTFOLIO_SPARK} color="var(--accent)" width={250} height={64} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-xs font-semibold text-on-brand">
                <ArrowDownLeft className="size-3.5" /> Buy
              </button>
              <button className="flex items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-xs font-semibold text-fg">
                <ArrowUpRight className="size-3.5" /> Sell
              </button>
            </div>

            <p className="mt-5 text-2xs uppercase tracking-wider text-fg-subtle">Holdings</p>
            <ul className="mt-2 space-y-1.5">
              {HOLDINGS.map((a) => {
                const up = a.change24h >= 0;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-md border border-transparent px-1.5 py-1.5"
                  >
                    <AssetMark symbol={a.symbol} glyph={a.glyph} hue={a.hue} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-fg">{a.name}</span>
                      <span className="block text-2xs text-fg-subtle">{a.symbol}</span>
                    </span>
                    <span className="text-right">
                      <span data-numeric className="block text-xs text-fg">
                        {formatPrice(a.price)}
                      </span>
                      <span
                        data-numeric
                        className={cn('block text-2xs font-semibold', up ? 'text-up' : 'text-down')}
                      >
                        {formatPercent(a.change24h)}
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
