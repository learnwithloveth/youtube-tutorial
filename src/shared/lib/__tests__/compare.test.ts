import { describe, expect, it } from 'vitest';

import { compareDecimalStrings, compareNullableDecimals } from '../compare';

describe('compareDecimalStrings', () => {
  it('orders by magnitude, not string order', () => {
    expect(compareDecimalStrings('9.00', '10.00')).toBe(-1);
    expect(compareDecimalStrings('100.00', '99.99')).toBe(1);
  });

  it('distinguishes values a double cannot', () => {
    // Both parse to the same float; only exact comparison separates them.
    const a = '9007199254740993.00';
    const b = '9007199254740992.00';
    expect(Number(a) === Number(b)).toBe(true);
    expect(compareDecimalStrings(a, b)).toBe(1);
  });

  it('compares fractions of differing length', () => {
    expect(compareDecimalStrings('1.5', '1.50')).toBe(0);
    expect(compareDecimalStrings('1.5', '1.05')).toBe(1);
    expect(compareDecimalStrings('0.00002341', '0.0000234')).toBe(1);
  });

  it('handles negatives and leading zeros', () => {
    expect(compareDecimalStrings('-1.00', '1.00')).toBe(-1);
    expect(compareDecimalStrings('-2.00', '-1.00')).toBe(-1);
    expect(compareDecimalStrings('007.00', '7.00')).toBe(0);
  });

  it('sorts a list the way a market table needs', () => {
    const sorted = ['1874000000000.00', '507400000000.00', '61200000000.00', '0.62'].sort(
      compareDecimalStrings,
    );
    expect(sorted[0]).toBe('0.62');
    expect(sorted.at(-1)).toBe('1874000000000.00');
  });
});

describe('compareNullableDecimals', () => {
  it('puts absent values last regardless of direction', () => {
    expect(compareNullableDecimals(null, '1.00')).toBe(1);
    expect(compareNullableDecimals('1.00', null)).toBe(-1);
    expect(compareNullableDecimals(null, null)).toBe(0);
  });
});
