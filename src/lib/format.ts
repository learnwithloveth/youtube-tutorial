/** Intl formatters are expensive to construct — memoise per (locale, options) key. */
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

/** Price formatting that adapts precision to magnitude (BTC vs SHIB). */
export function formatPrice(value: number, currency = 'USD'): string {
  const fractionDigits = value >= 1000 ? 2 : value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return formatter({
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCompact(value: number, currency?: string): string {
  return formatter({
    notation: 'compact',
    maximumFractionDigits: 2,
    ...(currency ? { style: 'currency', currency } : {}),
  }).format(value);
}

export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatQuantity(value: number, digits = 6): string {
  return formatter({ maximumFractionDigits: digits }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}
