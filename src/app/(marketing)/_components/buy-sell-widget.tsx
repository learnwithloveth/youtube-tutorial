'use client';

import { ArrowDownUp, ChevronDown, Lock, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BRAND } from '@/modules/content';
import { estimateConversion, type MarketDto } from '@/modules/market-data';
import { BasisPoints, Money } from '@/shared/kernel';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatPrice, formatQuantity } from '@/shared/lib/format';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';

type Mode = 'buy' | 'sell' | 'convert';

const MODES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'convert', label: 'Convert' },
] as const satisfies readonly { value: Mode; label: string }[];

const PRESETS = [100, 500, 1000, 5000];
/** The 0.10% the design quotes, as an exact integer rate. */
const FEE_RATE = BasisPoints.fromPercent(0.1);
const QUOTE_CURRENCY = 'USD';
const AMOUNT_SCALE = 2;

/**
 * The conversion widget.
 *
 * Interactive, so a Client Component — but it receives its markets as a prop
 * from the server rather than fetching them, which means the panel is filled in
 * on first paint instead of after a round trip.
 *
 * All three sums go through `estimateConversion`, the domain service, so the
 * fee and the received quantity are exact integers rather than floats. That is
 * the difference between "Novex fee $1.00" and "$1.0000000000000002" on the
 * single most scrutinised element of the page.
 */
export function BuySellWidget({
  markets,
  className,
  defaultSlug = 'btc',
}: {
  markets: readonly MarketDto[];
  className?: string;
  defaultSlug?: string;
}) {
  const priced = useMemo(
    () => markets.filter((market) => market.quote.state !== 'unavailable'),
    [markets],
  );

  const [mode, setMode] = useState<Mode>('buy');
  const [slug, setSlug] = useState(defaultSlug);
  const [amount, setAmount] = useState('1000');
  const [pickerOpen, setPickerOpen] = useState(false);

  const market = priced.find((item) => item.slug === slug) ?? priced[0];
  const quote = market?.quote;

  const estimate = useMemo(() => {
    if (!quote || quote.state === 'unavailable') return null;

    const gross = parseAmount(amount);
    const price = Money.fromDecimalString(quote.price, quote.currency, priceScale(quote.price));
    return estimateConversion(gross, price, FEE_RATE);
  }, [amount, quote]);

  // With no priced asset there is nothing honest to show, so the widget stands
  // down rather than rendering a panel full of zeroes.
  if (!market || !quote || quote.state === 'unavailable' || !estimate) {
    return <QuoteUnavailable className={className} />;
  }

  const up = quote.direction !== 'down';

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
                <span
                  className={cn(
                    'absolute inline-flex size-full rounded-full',
                    quote.state === 'live'
                      ? 'animate-[pulse-ring_2.6s_var(--ease-out-expo)_infinite] bg-up'
                      : 'bg-warn',
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex size-1.5 rounded-full',
                    quote.state === 'live' ? 'bg-up' : 'bg-warn',
                  )}
                />
              </span>
              {quote.state === 'live' ? 'Live' : 'Delayed'}
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
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
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
                    Number(amount) === preset
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
              <span
                data-numeric
                className="truncate font-display text-3xl font-semibold tracking-tight text-fg"
              >
                {formatQuantity(estimate.units, Number(estimate.units) < 1 ? 6 : 4)}
              </span>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPickerOpen((value) => !value)}
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                  className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3 transition-colors hover:border-line-strong"
                >
                  <AssetMark
                    symbol={market.symbol}
                    glyph={market.glyph}
                    hue={market.hue}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-fg">{market.symbol}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-fg-subtle transition-transform',
                      pickerOpen && 'rotate-180',
                    )}
                  />
                </button>

                {pickerOpen ? (
                  <ul
                    role="listbox"
                    aria-label="Select asset"
                    className="absolute right-0 top-full z-20 mt-2 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-bg-elev/95 p-1.5 shadow-float backdrop-blur-2xl"
                  >
                    {priced.map((option) => (
                      <li key={option.slug}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.slug === market.slug}
                          onClick={() => {
                            setSlug(option.slug);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                            option.slug === market.slug ? 'bg-surface-hover' : 'hover:bg-surface',
                          )}
                        >
                          <AssetMark
                            symbol={option.symbol}
                            glyph={option.glyph}
                            hue={option.hue}
                            size="sm"
                          />
                          <span className="flex-1 text-sm text-fg">{option.symbol}</span>
                          <span data-numeric className="text-xs text-fg-subtle">
                            {option.quote.state !== 'unavailable'
                              ? formatPrice(option.quote.price, option.quote.currency)
                              : '—'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              {quote.sparkline ? (
                <Sparkline
                  id={`widget-${market.symbol}`}
                  data={quote.sparkline}
                  positive={up}
                  width={92}
                  height={26}
                />
              ) : null}
              <span
                data-numeric
                className={cn('text-xs font-semibold', up ? 'text-up' : 'text-down')}
              >
                {formatPercent(quote.change24hPercent)} 24h
              </span>
            </div>
          </div>

          <dl id="rate-summary" className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-subtle">Rate</dt>
              <dd data-numeric className="text-fg-muted">
                1 {market.symbol} = {formatPrice(quote.price, quote.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-subtle">{BRAND.name} fee (0.10%)</dt>
              <dd data-numeric className="text-fg-muted">
                {formatPrice(estimate.fee.toDecimalString(), QUOTE_CURRENCY)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5">
              <dt className="font-medium text-fg">Total</dt>
              <dd data-numeric className="font-medium text-fg">
                {formatPrice(estimate.net.toDecimalString(), QUOTE_CURRENCY)}
              </dd>
            </div>
          </dl>

          <ButtonLink href="/signup" size="lg" sheen className="mt-5 w-full">
            {mode === 'sell' ? 'Sell' : mode === 'convert' ? 'Convert' : 'Buy'} {market.symbol}
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

function QuoteUnavailable({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <div className="hairline rounded-xl bg-bg-elev/85 p-8 text-center shadow-float backdrop-blur-2xl">
        <p className="font-display text-lg font-semibold text-fg">Quotes are unavailable</p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-fg-muted">
          We are not receiving prices right now, so there is nothing to quote. Rates return as soon
          as the feed does.
        </p>
        <ButtonLink href="/markets" variant="outline" size="md" className="mt-6">
          Browse markets
        </ButtonLink>
      </div>
    </div>
  );
}

/** Parses the field's free text into an exact amount; blank means zero. */
function parseAmount(raw: string): Money {
  const cleaned = raw.trim();
  if (cleaned === '' || cleaned === '.') return Money.zero(QUOTE_CURRENCY, AMOUNT_SCALE);
  try {
    return Money.fromDecimalString(cleaned, QUOTE_CURRENCY, AMOUNT_SCALE);
  } catch {
    // Mid-typing states like "12." are not decimals yet. Treat them as zero
    // rather than letting a parse error escape into the render.
    return Money.zero(QUOTE_CURRENCY, AMOUNT_SCALE);
  }
}

/** The precision a price string was published at, from the string itself. */
function priceScale(price: string): number {
  return price.split('.')[1]?.length ?? 0;
}
