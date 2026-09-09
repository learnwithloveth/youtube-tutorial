import { describe, expect, it } from 'vitest';

import { BasisPoints, Money } from '@/shared/kernel';

import { QUANTITY_SCALE, estimateConversion } from '../conversion';

const usd = (amount: string) => Money.fromDecimalString(amount, 'USD', 2);
const FEE = BasisPoints.fromPercent(0.1); // the widget's 0.10%

describe('estimateConversion', () => {
  it('computes the fee exactly where float maths does not', () => {
    // 1000 * 0.001 is 1.0000000000000002 in floating point.
    const estimate = estimateConversion(usd('1000.00'), usd('94820.44'), FEE);

    expect(estimate.fee.toDecimalString()).toBe('1.00');
    expect(estimate.net.toDecimalString()).toBe('999.00');
  });

  it('divides to an exact asset quantity', () => {
    const estimate = estimateConversion(usd('999.00'), usd('100.00'), BasisPoints.zero());

    expect(estimate.units).toBe('9.99000000');
  });

  it('quotes the quantity to the declared scale', () => {
    const estimate = estimateConversion(usd('1000.00'), usd('94820.44'), FEE);

    expect(estimate.units.split('.')[1]).toHaveLength(QUANTITY_SCALE);
    // 999.00 / 94820.44 = 0.0105357031…
    expect(estimate.units).toBe('0.01053570');
  });

  it('rounds the last quantity digit half away from zero', () => {
    // 1.00 / 3.00 = 0.333...  → the eighth decimal rounds up from 0.33333333|3
    const estimate = estimateConversion(usd('1.00'), usd('3.00'), BasisPoints.zero());

    expect(estimate.units).toBe('0.33333333');
  });

  it('keeps gross = fee + net for every amount it is given', () => {
    for (const amount of ['0.01', '1.00', '7.77', '1000.00', '123456.78']) {
      const estimate = estimateConversion(usd(amount), usd('94820.44'), FEE);
      expect(estimate.fee.add(estimate.net).toDecimalString()).toBe(amount);
    }
  });

  it('handles a sub-cent price without collapsing the quantity to zero', () => {
    const price = Money.fromDecimalString('0.00002341', 'USD', 8);
    const estimate = estimateConversion(usd('100.00'), price, BasisPoints.zero());

    expect(estimate.units).toBe('4271678.76975651');
  });

  it('returns zero units rather than dividing by a zero price', () => {
    const estimate = estimateConversion(usd('100.00'), usd('0.00'), BasisPoints.zero());

    expect(Number(estimate.units)).toBe(0);
  });

  it('charges no fee at a zero rate', () => {
    const estimate = estimateConversion(usd('500.00'), usd('100.00'), BasisPoints.zero());

    expect(estimate.fee.isZero).toBe(true);
    expect(estimate.net.toDecimalString()).toBe('500.00');
  });
});
