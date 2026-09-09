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

export function formatCompact(decimal: string | number, currency?: string): string {
  return formatter({
    notation: 'compact',
    maximumFractionDigits: 2,
    ...(currency ? { style: 'currency', currency } : {}),
  }).format(Number(decimal));
}

/** Signed percentage, e.g. "+2.41%". */
export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatQuantity(value: string | number, digits = 6): string {
  return formatter({ maximumFractionDigits: digits }).format(Number(value));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
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
