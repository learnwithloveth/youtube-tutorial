import type { ReactNode } from 'react';
import { Sparkline } from '@/shared/ui/visuals/sparkline';
import { cn } from '@/shared/lib/cn';

interface StatTileProps {
  label: string;
  value: string;
  /** Signed, always paired with the period it is measured against. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; period: string };
  /** Whether a rise is good. Fees and drawdown invert it. */
  upIsGood?: boolean;
  trend?: readonly number[];
  icon?: ReactNode;
  className?: string;
}

/**
 * The stat tile contract: label · value · delta · trend.
 *
 * Values use proportional figures — `tabular-nums` gives every digit the width of
 * a zero, which reads loose at display size. Columns of numbers get tabular
 * figures; a single large number does not.
 */
export function StatTile({
  label, value, delta, upIsGood = true, trend, icon, className,
}: StatTileProps) {
  const good = delta?.direction === 'flat' ? null : (delta?.direction === 'up') === upIsGood;
  const deltaClass = good === null ? 'text-fg-muted' : good ? 'text-up' : 'text-down';

  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-bg-elev/70 p-5 backdrop-blur-xl',
        'transition-colors duration-300 hover:border-line-strong',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-fg-subtle">{label}</p>
        {icon ? <span className="text-fg-subtle">{icon}</span> : null}
      </div>

      <p className="mt-2.5 font-sans text-2xl font-semibold tracking-tight text-fg">{value}</p>

      <div className="mt-3 flex items-end justify-between gap-3">
        {delta ? (
          <p className="text-xs">
            <span className={cn('font-medium', deltaClass)}>{delta.value}</span>{' '}
            <span className="text-fg-subtle">{delta.period}</span>
          </p>
        ) : (
          <span />
        )}
        {trend && trend.length > 1 ? (
          <Sparkline
          id={`stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            data={trend}
            color={good === false ? 'var(--down)' : 'var(--chart-1)'}
            width={72}
            height={26}
            filled={false}
            strokeWidth={1.5}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The one number a view leads with. Exactly one per screen.
 *
 * Tabular figures are the deliberate exception to the proportional rule here:
 * this value re-renders on every price tick, and proportional digits make it
 * jitter horizontally as the glyphs change width.
 */
export function HeroFigure({
  label, value, delta, className,
}: {
  label: string;
  value: string;
  delta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-[0.14em] text-fg-subtle">{label}</p>
      <p className="mt-2 font-sans text-[clamp(2.25rem,1.6rem+2.6vw,3.25rem)] font-semibold leading-none tracking-tight tabular-nums text-fg">
        {value}
      </p>
      {delta ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">{delta}</div> : null}
    </div>
  );
}

/** Fill carries severity; the track is a lighter step of the same ramp. */
export function Meter({
  label, value, max, tone = 'brand', formatValue,
}: {
  label: string;
  value: number;
  max: number;
  tone?: 'brand' | 'warn' | 'down';
  formatValue: (v: number) => string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const fill = tone === 'brand' ? 'var(--chart-1)' : tone === 'warn' ? 'var(--warn)' : 'var(--down)';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums text-fg">
          {formatValue(value)} <span className="text-fg-subtle">/ {formatValue(max)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-label={label}
        className="mt-2 h-1.5 overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklab, ${fill} 18%, var(--chart-surface))` }}
      >
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}
