import { useMemo, useState } from 'react';
import { ArrowDownUp, ChevronDown, Lock, Zap } from 'lucide-react';
import { ASSETS } from '@/features/markets/assets';
import { useLiveQuotes } from '@/features/markets/useMarkets';
import { AssetMark } from '@/components/visuals/AssetMark';
import { Sparkline } from '@/components/visuals/Sparkline';
import { ButtonLink } from '@/design-system/primitives/Button';
import { SegmentedControl } from '@/design-system/primitives/SegmentedControl';
import { formatPercent, formatPrice, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/cn';

type Mode = 'buy' | 'sell' | 'convert';

const MODES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'convert', label: 'Convert' },
] as const satisfies readonly { value: Mode; label: string }[];

const PRESETS = [100, 500, 1000, 5000];
const FEE_RATE = 0.001;

/**
 * The conversion widget. All maths runs against the live quote so the numbers
 * move while the user watches — the single most persuasive element on the page.
 */
export function BuySellWidget({ className, defaultAssetId = 'btc' }: { className?: string; defaultAssetId?: string }) {
  const quotes = useLiveQuotes(ASSETS.slice(0, 12));
  const [mode, setMode] = useState<Mode>('buy');
  const [assetId, setAssetId] = useState(defaultAssetId);
  const [amount, setAmount] = useState('1000');
  const [pickerOpen, setPickerOpen] = useState(false);

  const quote = quotes.find((q) => q.id === assetId) ?? quotes[0];
  const parsed = Number.parseFloat(amount) || 0;

  const { fee, net, units } = useMemo(() => {
    const feeValue = parsed * FEE_RATE;
    const netValue = mode === 'sell' ? parsed - feeValue : parsed - feeValue;
    return { fee: feeValue, net: netValue, units: quote ? netValue / quote.live : 0 };
  }, [parsed, mode, quote]);

  if (!quote) return null;
  const up = quote.change24h >= 0;

  return (
    <div className={cn('relative', className)}>
      <div className="glow-ring rounded-xl">
        <div className="hairline relative overflow-hidden rounded-xl bg-bg-elev/85 p-5 shadow-float backdrop-blur-2xl sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <SegmentedControl
              ariaLabel="Order type"
              segments={MODES}
              value={mode}
              onChange={setMode}
              size="sm"
            />
            <span className="inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-[pulse-ring_2.6s_var(--ease-out-expo)_infinite] rounded-full bg-up" />
                <span className="relative inline-flex size-1.5 rounded-full bg-up" />
              </span>
              Live
            </span>
          </div>

          {/* Pay */}
          <div className="rounded-lg border border-line bg-bg-sunken/60 p-4">
            <label htmlFor="pay-amount" className="text-xs text-fg-subtle">
              {mode === 'sell' ? 'You sell' : 'You pay'}
            </label>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-display text-2xl font-semibold text-fg-subtle">$</span>
              <input
                id="pay-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full min-w-0 bg-transparent font-display text-3xl font-semibold tracking-tight text-fg outline-none"
                aria-describedby="rate-summary"
              />
              <span className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-fg-muted">
                USD
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-all duration-300',
                    parsed === preset
                      ? 'border-brand-soft/60 bg-brand/15 text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  ${preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center">
            <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
            <span className="relative -my-3 grid size-9 place-items-center rounded-full border border-line bg-bg-elev text-fg-muted">
              <ArrowDownUp className="size-4" />
            </span>
          </div>

          {/* Receive */}
          <div className="rounded-lg border border-line bg-bg-sunken/60 p-4">
            <span className="text-xs text-fg-subtle">You receive (estimated)</span>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span data-numeric className="truncate font-display text-3xl font-semibold tracking-tight text-fg">
                {formatQuantity(units, units < 1 ? 6 : 4)}
              </span>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                  className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3 transition-colors hover:border-line-strong"
                >
                  <AssetMark symbol={quote.symbol} glyph={quote.glyph} hue={quote.hue} size="sm" />
                  <span className="text-sm font-medium text-fg">{quote.symbol}</span>
                  <ChevronDown className={cn('size-3.5 text-fg-subtle transition-transform', pickerOpen && 'rotate-180')} />
                </button>

                {pickerOpen ? (
                  <ul
                    role="listbox"
                    aria-label="Select asset"
                    className="absolute right-0 top-full z-20 mt-2 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-bg-elev/95 p-1.5 shadow-float backdrop-blur-2xl"
                  >
                    {quotes.map((q) => (
                      <li key={q.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={q.id === assetId}
                          onClick={() => {
                            setAssetId(q.id);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                            q.id === assetId ? 'bg-surface-hover' : 'hover:bg-surface',
                          )}
                        >
                          <AssetMark symbol={q.symbol} glyph={q.glyph} hue={q.hue} size="sm" />
                          <span className="flex-1 text-sm text-fg">{q.symbol}</span>
                          <span data-numeric className="text-xs text-fg-subtle">
                            {formatPrice(q.live)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Sparkline data={quote.spark} positive={up} width={92} height={26} />
              <span data-numeric className={cn('text-xs font-semibold', up ? 'text-up' : 'text-down')}>
                {formatPercent(quote.change24h)} 24h
              </span>
            </div>
          </div>

          <dl id="rate-summary" className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-subtle">Rate</dt>
              <dd data-numeric className="text-fg-muted">
                1 {quote.symbol} = {formatPrice(quote.live)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">Novex fee (0.10%)</dt>
              <dd data-numeric className="text-fg-muted">
                {formatPrice(fee)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5">
              <dt className="font-medium text-fg">Total</dt>
              <dd data-numeric className="font-medium text-fg">
                {formatPrice(net)}
              </dd>
            </div>
          </dl>

          <ButtonLink to="/signup" size="lg" sheen className="mt-5 w-full">
            {mode === 'sell' ? 'Sell' : mode === 'convert' ? 'Convert' : 'Buy'} {quote.symbol}
          </ButtonLink>

          <ul className="mt-4 flex items-center justify-center gap-5 text-2xs text-fg-subtle">
            <li className="inline-flex items-center gap-1.5">
              <Lock className="size-3" /> Funds segregated
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Zap className="size-3" /> Settles in 2 seconds
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
