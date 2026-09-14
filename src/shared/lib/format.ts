/**
 * Presentation formatting.
 *
 * This is the boundary the domain's exactness hands off to `Intl`, which only
 * takes numbers. The conversion happens *here*, on a value that is about to
 * become pixels and will never be stored or added to anything — which is the
 * only place it is safe.
 *
 * The formatters therefore take decimal *strings*, matching what the DTOs
 * carry. A formatter that took a number would push the lossy conversion up into
 * the callers, where it would eventually happen before some arithmetic instead
 * of after all of it.
 */

/** Intl formatters are expensive to construct — memoise per (locale, options). */
const numberCache = new Map<string, Intl.NumberFormat>();

function formatter(options: Intl.NumberFormatOptions, locale = 'en-US'): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let cached = numberCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options);
    numberCache.set(key, cached);
  }
  return cached;
}

/**
 * Price formatting that adapts precision to magnitude, so BTC reads as
 * $94,820.44 and a sub-cent asset keeps the digits that carry its value.
 */
export function formatPrice(decimal: string, currency = 'USD'): string {
  const value = Number(decimal);
  const fractionDigits = value >= 1000 ? 2 : value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return formatter({
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Compact notation, computed by hand rather than delegated to
 * `Intl.NumberFormat({ notation: 'compact' })`.
 *
 * The stdlib version is not portable. Under `style: 'currency'` the currency's
 * default `minimumFractionDigits` (2 for USD) interacts with compact rounding
 * differently across ICU builds: Node renders 41_200_000_000 as "$41.2B" while
 * some Chromium builds render "$41.20B". In a server-rendered app that
 * divergence is not cosmetic — the prerendered HTML and the hydrated DOM
 * disagree, React discards the subtree and logs hydration error #418.
 *
 * So the magnitude split and the mantissa precision are decided here, and Intl
 * is used only for what is stable everywhere: digit grouping and the currency
 * symbol. Precision targets three significant figures, which is what reads well
 * in a stat tile: 412B, 41.2B, 4.12B.
 */
const COMPACT_UNITS = [
  { min: 1e12, divisor: 1e12, suffix: 'T' },
  { min: 1e9, divisor: 1e9, suffix: 'B' },
  { min: 1e6, divisor: 1e6, suffix: 'M' },
  { min: 1e3, divisor: 1e3, suffix: 'K' },
] as const;

function mantissaDigits(mantissa: number): number {
  const magnitude = Math.abs(mantissa);
  if (magnitude >= 100) return 0;
  if (magnitude >= 10) return 1;
  return 2;
}

export function formatCompact(decimal: string | number, currency?: string): string {
  const value = Number(decimal);
  const abs = Math.abs(value);
  const unit = COMPACT_UNITS.find((candidate) => abs >= candidate.min);

  // Below 1K there is nothing to compact; render as-is on the same
  // three-significant-figure budget so tiles stay visually consistent.
  const mantissa = unit ? value / unit.divisor : value;
  const digits = mantissaDigits(mantissa);

  const body = formatter({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(currency ? { style: 'currency', currency } : {}),
  }).format(mantissa);

  return unit ? `${body}${unit.suffix}` : body;
}

/** Signed percentage, e.g. "+2.41%". */
export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatQuantity(value: string | number, digits = 6): string {
  return formatter({ maximumFractionDigits: digits }).format(Number(value));
}

/**
 * Constructed once. `Intl.DateTimeFormat` is expensive to build and this is
 * called per row on tables that render hundreds of rows.
 *
 * `timeZone` is pinned deliberately. An unpinned formatter resolves to the
 * *host* zone: Next prerenders on a server (UTC in most deployments) and
 * rehydrates in the reader's browser (anything). The two strings differ — a
 * 23:30 UTC timestamp is "Sep 9" on the server and "Sep 10" in Lagos — React
 * discards the server HTML for that subtree and logs hydration error #418.
 */
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/**
 * "14:32:08" for an operations timestamp.
 *
 * Pinned to UTC for the reason above, and labelled as UTC wherever it is shown.
 * A console that displayed each operator's local time would be worse than one
 * that displays a single zone: two people comparing the same incident over a call
 * would be reading different clocks, and neither would know it.
 */
const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

export function formatClock(iso: string): string {
  return clockFormatter.format(new Date(iso));
}

/**
 * "3 minutes ago" for a staleness label.
 *
 * Rendered from a duration the server computed, never from `Date.now()` in a
 * component — a component that read the clock during render would produce
 * different HTML on the server and the client and fail hydration.
 */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * "4m 12s" for an elapsed duration.
 *
 * Distinct from `formatAge`, which says how long *ago* an instant was. This one
 * measures a span — how long someone has been on a page — and keeps the second
 * unit, because the difference between eight seconds and fifty on a page is the
 * difference between a bounce and a read, and "0m" would hide it.
 *
 * Same rule as `formatAge`: the duration is computed by the server and passed in.
 * A component that read the clock during render would produce different HTML on
 * each side of hydration.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * "Sep 14, 2026 at 23:16 UTC" — a date and a time on one line.
 *
 * ── Not "Today at 23:16" ──────────────────────────────────────────────────────
 * Relative wording needs the reader's clock, and a Server Component that reads
 * one renders a different string than the browser does and fails hydration — the
 * bug `formatDate` and `formatAge` already exist to avoid. It is also wrong on a
 * document: "Today" printed onto paper is false the following morning, and this
 * string ends up in an inbox and a filing cabinet.
 *
 * The zone is pinned and *named*, because a bare time on a receipt is a time in
 * an unstated zone, and that is the one thing a dispute turns on.
 */
const stampFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

export function formatTimestamp(iso: string): string {
  // Rebuilt from `formatToParts` rather than sliced out of the formatted string:
  // en-US joins the date and the time with ", " and this wants " at ", and the
  // separator a locale chose is not something to find by index.
  const parts = stampFormatter.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('month')} ${part('day')}, ${part('year')} at ${part('hour')}:${part('minute')} UTC`;
}
