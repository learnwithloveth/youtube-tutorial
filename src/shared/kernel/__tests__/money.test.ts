import { describe, expect, it } from 'vitest';

import { Money } from '../money';

describe('Money', () => {
  describe('construction from decimal strings', () => {
    it('parses a plain decimal at the declared scale', () => {
      const price = Money.fromDecimalString('94820.44', 'USD', 2);
      expect(price.minorUnits).toBe(9482044n);
      expect(price.toDecimalString()).toBe('94820.44');
    });

    it('pads a short fraction out to the scale', () => {
      expect(Money.fromDecimalString('1.5', 'USD', 4).minorUnits).toBe(15000n);
    });

    it('truncates rather than rounds a fraction longer than the scale', () => {
      // Rounding here would invent a final digit the source never asserted.
      expect(Money.fromDecimalString('0.999', 'USD', 2).toDecimalString()).toBe('0.99');
    });

    it('carries sub-cent prices that scale 2 would flatten to zero', () => {
      const shib = Money.fromDecimalString('0.00002341', 'USD', 8);
      expect(shib.minorUnits).toBe(2341n);
      expect(shib.toDecimalString()).toBe('0.00002341');
    });

    it('round-trips negative amounts', () => {
      const owed = Money.fromDecimalString('-12.34', 'USD', 2);
      expect(owed.minorUnits).toBe(-1234n);
      expect(owed.toDecimalString()).toBe('-12.34');
    });

    it('rejects anything that is not a decimal', () => {
      expect(() => Money.fromDecimalString('1e5', 'USD', 2)).toThrow(TypeError);
      expect(() => Money.fromDecimalString('twelve', 'USD', 2)).toThrow(TypeError);
      expect(() => Money.fromDecimalString('', 'USD', 2)).toThrow(TypeError);
    });
  });

  describe('exactness', () => {
    it('adds decimal fractions that float arithmetic gets wrong', () => {
      // The canonical float failure: 0.1 + 0.2 === 0.30000000000000004
      const total = Money.fromDecimalString('0.1', 'USD', 2).add(
        Money.fromDecimalString('0.2', 'USD', 2),
      );
      expect(total.toDecimalString()).toBe('0.30');
    });

    it('stays exact across a long run of additions', () => {
      let balance = Money.zero('USD', 2);
      for (let i = 0; i < 10_000; i += 1) {
        balance = balance.add(Money.fromDecimalString('0.01', 'USD', 2));
      }
      expect(balance.toDecimalString()).toBe('100.00');
    });

    it('holds values beyond the safe integer range', () => {
      // Tether's supply carried at 8 dp is ~1.43e19 minor units, three orders of
      // magnitude past Number.MAX_SAFE_INTEGER (~9.01e15). A float cannot count
      // this high without skipping integers; bigint can.
      const supply = Money.fromDecimalString('142830000000.00000000', 'USD', 8);
      expect(supply.minorUnits).toBe(14283000000000000000n);
      expect(supply.minorUnits > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(supply.toDecimalString()).toBe('142830000000.00000000');
    });

    it('keeps a trillion-dollar market cap exact at cent precision', () => {
      const marketCap = Money.fromDecimalString('1874000000000.00', 'USD', 2);
      expect(marketCap.minorUnits).toBe(187400000000000n);
      expect(marketCap.toDecimalString()).toBe('1874000000000.00');
    });
  });

  describe('arithmetic guards', () => {
    it('refuses to add different currencies', () => {
      const usd = Money.fromDecimalString('1.00', 'USD', 2);
      const eur = Money.fromDecimalString('1.00', 'EUR', 2);
      expect(() => usd.add(eur)).toThrow(/convert to a common currency/);
    });

    it('refuses to add different scales', () => {
      const cents = Money.fromDecimalString('1.00', 'USD', 2);
      const precise = Money.fromDecimalString('1.00', 'USD', 8);
      expect(() => cents.add(precise)).toThrow(/withScale/);
    });

    it('subtracts within a currency and scale', () => {
      const result = Money.fromDecimalString('10.00', 'USD', 2).subtract(
        Money.fromDecimalString('3.33', 'USD', 2),
      );
      expect(result.toDecimalString()).toBe('6.67');
    });
  });

  describe('withScale', () => {
    it('widens without loss', () => {
      const widened = Money.fromDecimalString('1.25', 'USD', 2).withScale(6);
      expect(widened.toDecimalString()).toBe('1.250000');
    });

    it('narrows by rounding half away from zero', () => {
      expect(Money.fromDecimalString('1.005', 'USD', 3).withScale(2).toDecimalString()).toBe('1.01');
      expect(Money.fromDecimalString('-1.005', 'USD', 3).withScale(2).toDecimalString()).toBe('-1.01');
      expect(Money.fromDecimalString('1.004', 'USD', 3).withScale(2).toDecimalString()).toBe('1.00');
    });

    it('is identity at the same scale', () => {
      const price = Money.fromDecimalString('4218.90', 'USD', 2);
      expect(price.withScale(2)).toBe(price);
    });
  });

  describe('comparison', () => {
    it('orders amounts', () => {
      const low = Money.fromDecimalString('1.00', 'USD', 2);
      const high = Money.fromDecimalString('2.00', 'USD', 2);
      expect(low.compare(high)).toBe(-1);
      expect(high.compare(low)).toBe(1);
      expect(low.compare(Money.fromDecimalString('1.00', 'USD', 2))).toBe(0);
    });

    it('treats equal amounts at different scales as not equal', () => {
      // They are the same quantity but were captured at different precisions,
      // and conflating the two is how precision silently disappears.
      const a = Money.fromDecimalString('1.00', 'USD', 2);
      const b = Money.fromDecimalString('1.00', 'USD', 4);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('serialisation', () => {
    it('round-trips through JSON without passing via a float', () => {
      const original = Money.fromDecimalString('0.00002341', 'USD', 8);
      const restored = Money.fromJSON(JSON.parse(JSON.stringify(original)));
      expect(restored.equals(original)).toBe(true);
    });
  });

  describe('the unsafe number boundary', () => {
    it('accepts hand-authored figures at the declared scale', () => {
      expect(Money.fromUnsafeNumber(94820.44, 'USD', 2).toDecimalString()).toBe('94820.44');
    });

    it('rejects non-finite input', () => {
      expect(() => Money.fromUnsafeNumber(Number.NaN, 'USD', 2)).toThrow(TypeError);
      expect(() => Money.fromUnsafeNumber(Number.POSITIVE_INFINITY, 'USD', 2)).toThrow(TypeError);
    });
  });
});
