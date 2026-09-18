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

// Every timestamp in the consoles is rendered in UTC, deliberately.
//
// Two reasons, in order of importance:
//   1. Correctness under SSR. `Intl.DateTimeFormat` without an explicit
//      `timeZone` resolves to the *host* zone. These screens are rendered on a
//      server (UTC in most deployments) and rehydrated in the operator's
//      browser (anything). The two strings differ — 23:30 UTC is "Sep 9" on
//      that subtree and logs hydration error #418.
//   2. Operational correctness. An audit log, an approval queue and an incident
//      timeline are cross-timezone artefacts; two operators in different
//      offices must be able to quote the same timestamp. UTC is the only zone
//      they can agree on, which is why the UI labels it.
//
// Do not "improve" this to local time.
const ZONE = 'UTC';

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: ZONE,
});
const longDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: ZONE,
});
const timeOnly = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ZONE,
});

export const dayLabel = (t: number) => shortDate.format(t);
export const fullDayLabel = (t: number) => longDate.format(t);
export const timeLabel = (t: number) => timeOnly.format(t);
export const dateTimeLabel = (iso: string) =>
  `${shortDate.format(new Date(iso))} · ${timeOnly.format(new Date(iso))}`;
