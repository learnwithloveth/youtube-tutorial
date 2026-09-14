import { describe, expect, it } from 'vitest';

import {
  formatCompact,
  formatDate,
  formatPercent,
  formatPrice,
  formatTimestamp,
} from '../format';

/**
 * These guard two bugs that were shipped and fixed, both of which produce React
 * hydration error #418 — the server renders one string, the browser renders
 * another, and React discards the subtree.
 *
 * Neither is visible on a UTC machine with one ICU build, which is exactly why
 * they need tests rather than eyes.
 */

describe('formatDate', () => {
  it('renders in UTC regardless of the host timezone', () => {
    // 23:30 UTC is already the next day in any zone east of Greenwich. An
    // unpinned formatter returns "Sep 10" on a machine in Lagos or Tokyo and
    // "Sep 9" on the UTC server that prerendered it.
    //
    // This assertion holds on every machine only because the formatter pins
    // `timeZone: 'UTC'`. It fails on a non-UTC host without the pin, which is
    // the regression it exists to catch.
    expect(formatDate('2026-09-09T23:30:00Z')).toBe('Sep 9, 2026');
  });

  it('does not shift a midday timestamp either', () => {
    expect(formatDate('2026-01-15T12:00:00Z')).toBe('Jan 15, 2026');
  });
});

describe('formatCompact', () => {
  it('splits magnitudes by hand rather than via Intl compact notation', () => {
    // `Intl.NumberFormat({ notation: 'compact', style: 'currency' })` disagrees
    // across ICU builds on exactly this value — "$41.2B" on Node, "$41.20B" on
    // some Chromium builds. The hand-rolled split is what makes server and
    // client agree.
    expect(formatCompact(41_200_000_000, 'USD')).toBe('$41.2B');
  });

  it('targets three significant figures across each magnitude', () => {
    expect(formatCompact(412_000_000_000, 'USD')).toBe('$412B');
    expect(formatCompact(41_200_000_000, 'USD')).toBe('$41.2B');
    expect(formatCompact(4_120_000_000, 'USD')).toBe('$4.12B');
  });

  it('picks the right unit at each boundary', () => {
    expect(formatCompact(1_000, 'USD')).toBe('$1.00K');
    expect(formatCompact(1_000_000, 'USD')).toBe('$1.00M');
    expect(formatCompact(1_000_000_000, 'USD')).toBe('$1.00B');
    expect(formatCompact(1_000_000_000_000, 'USD')).toBe('$1.00T');
  });

  it('leaves values below a thousand uncompacted', () => {
    expect(formatCompact(999, 'USD')).toBe('$999');
    expect(formatCompact(12.5, 'USD')).toBe('$12.5');
  });

  it('handles negatives on the correct side of the symbol', () => {
    expect(formatCompact(-41_200_000_000, 'USD')).toBe('-$41.2B');
  });

  it('omits the currency when none is given', () => {
    expect(formatCompact(41_200_000_000)).toBe('41.2B');
  });

  it('accepts the exact decimal strings the DTOs carry', () => {
    expect(formatCompact('1874000000000.00', 'USD')).toBe('$1.87T');
  });
});

describe('formatPrice', () => {
  it('adapts precision to magnitude', () => {
    expect(formatPrice('94820.44')).toBe('$94,820.44');
    expect(formatPrice('0.2211')).toBe('$0.2211');
  });

  it('keeps the digits that carry a sub-cent value', () => {
    expect(formatPrice('0.00002341')).toBe('$0.000023');
  });
});

describe('formatPercent', () => {
  it('signs a gain and leaves a loss with its own minus', () => {
    expect(formatPercent(2.41)).toBe('+2.41%');
    expect(formatPercent(-1.24)).toBe('-1.24%');
    expect(formatPercent(0)).toBe('0.00%');
  });
});

describe('formatTimestamp', () => {
  it('names the zone it pinned', () => {
    // A bare time on a receipt is a time in an unstated zone, and that is the
    // one thing a dispute turns on.
    expect(formatTimestamp('2026-09-14T23:16:04Z')).toBe('Sep 14, 2026 at 23:16 UTC');
  });

  it('does not roll the date over on a host east of Greenwich', () => {
    // Same class of bug as formatDate's: unpinned, this reads "Sep 10" in Lagos
    // and "Sep 9" on the UTC box that prerendered it, and React throws away the
    // subtree.
    expect(formatTimestamp('2026-09-09T23:30:00Z')).toBe('Sep 9, 2026 at 23:30 UTC');
  });

  it('keeps a 24-hour clock rather than an am/pm the locale would prefer', () => {
    expect(formatTimestamp('2026-01-15T00:05:00Z')).toBe('Jan 15, 2026 at 00:05 UTC');
    expect(formatTimestamp('2026-01-15T13:45:00Z')).toBe('Jan 15, 2026 at 13:45 UTC');
  });
});
