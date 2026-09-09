import { formatCompact, formatPrice } from '@/shared/lib/format';

/**
 * Axis and tile helpers shared across the dashboard's charts.
 *
 * These take `number`, unlike the shared formatters, which take exact decimal
 * strings. That is not an inconsistency to fix — it is the boundary doing its
 * job. The market-data module carries prices as exact strings because they are
 * real observations that must not pass through a float. The figures here are
 * demo fixtures generated as numbers (see `data.ts`), so the conversion is
 * explicit and local rather than pretending they were ever exact.
 */
const asDecimal = (v: number) => v.toFixed(2);

export const money = (v: number) => formatPrice(asDecimal(v)).replace(/\.00$/, '');
export const moneyExact = (v: number) => formatPrice(asDecimal(v));
export const axisMoney = (v: number) =>
  Math.abs(v) >= 1000 ? formatCompact(v, 'USD') : formatPrice(asDecimal(v)).replace(/\.00$/, '');
export const signedMoney = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
export const signedPercent = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeOnly = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

export const dayLabel = (t: number) => shortDate.format(t);
export const fullDayLabel = (t: number) => longDate.format(t);
export const timeLabel = (t: number) => timeOnly.format(t);
export const dateTimeLabel = (iso: string) =>
  `${shortDate.format(new Date(iso))} · ${timeOnly.format(new Date(iso))}`;
