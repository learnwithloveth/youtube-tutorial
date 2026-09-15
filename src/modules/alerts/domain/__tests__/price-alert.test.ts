import { describe, expect, it } from 'vitest';

import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { PriceAlert, TARGET_SCALE, parseTarget } from '../price-alert';

const USER = 'user_1' as UserId;
const NOW = new Date('2026-09-15T12:00:00Z');

function alert(overrides: Partial<Parameters<typeof PriceAlert.create>[0]> = {}) {
  return PriceAlert.create({
    id: 'al_1',
    userId: USER,
    symbol: 'btc',
    direction: 'above',
    target: parseTarget('100000'),
    now: NOW,
    ...overrides,
  });
}

/** A quote at whatever precision its instrument happens to be quoted to. */
function quote(decimal: string, scale = 2) {
  return Money.fromDecimalString(decimal, 'USD', scale);
}

describe('creating', () => {
  it('normalises the symbol so BTC and btc are one market', () => {
    expect(alert().symbol).toBe('BTC');
  });

  it('refuses a target of zero or below', () => {
    expect(() => alert({ target: parseTarget('0') })).toThrow(RangeError);
    expect(() => alert({ target: Money.fromDecimalString('-5', 'USD', TARGET_SCALE) })).toThrow(
      RangeError,
    );
  });
});

describe('when an alert is satisfied', () => {
  it('fires on the level itself, not only past it', () => {
    // "Tell me when BTC is above 100,000" is satisfied by exactly 100,000. A
    // strict `>` would skip the level somebody deliberately picked — and it is
    // the one they check afterwards.
    expect(alert().isSatisfiedBy(quote('100000.00'))).toBe(true);
    expect(alert().isSatisfiedBy(quote('99999.99'))).toBe(false);
    expect(alert().isSatisfiedBy(quote('100000.01'))).toBe(true);
  });

  it('reads `below` the other way round', () => {
    const falling = alert({ direction: 'below', target: parseTarget('3800') });
    expect(falling.isSatisfiedBy(quote('3800.00'))).toBe(true);
    expect(falling.isSatisfiedBy(quote('3800.01'))).toBe(false);
    expect(falling.isSatisfiedBy(quote('3799.99'))).toBe(true);
  });

  it('compares a quote at any scale without refusing it', () => {
    // `Money.compare` throws on mismatched scales, and a quote arrives at whatever
    // precision its instrument uses. Without the restatement inside the aggregate
    // every evaluation of a sub-cent market would throw.
    const shib = alert({ symbol: 'SHIB', target: parseTarget('0.00002341') });
    expect(shib.isSatisfiedBy(Money.fromDecimalString('0.00002341', 'USD', 8))).toBe(true);
    expect(shib.isSatisfiedBy(Money.fromDecimalString('0.00002340', 'USD', 8))).toBe(false);
    expect(() => shib.isSatisfiedBy(quote('1.00', 2))).not.toThrow();
  });

  it('is never satisfied once it has fired', () => {
    // Fire once, then wait. Without this an alert sitting at its level produces
    // forty notifications in an afternoon, and the response to that is to turn
    // alerts off — which loses the one that mattered.
    const watching = alert();
    watching.fire(quote('100000.00'), NOW);

    expect(watching.status).toBe('triggered');
    expect(watching.isSatisfiedBy(quote('101000.00'))).toBe(false);
    expect(() => watching.fire(quote('101000.00'), NOW)).toThrow(/triggered/);
  });

  it('is never satisfied while muted', () => {
    const muted = alert();
    muted.mute();
    expect(muted.isSatisfiedBy(quote('100000.00'))).toBe(false);
  });

  it('watches again once re-armed', () => {
    const again = alert();
    again.fire(quote('100000.00'), NOW);
    again.rearm();

    expect(again.isSatisfiedBy(quote('100000.00'))).toBe(true);
    // Re-arming does not forget that it fired: the history stays on the row.
    expect(again.snapshot().triggeredAt).toEqual(NOW);
  });

  it('keeps the price that satisfied it, at the target scale', () => {
    const fired = alert();
    fired.fire(quote('100500.55'), NOW);
    expect(fired.snapshot().triggeredPrice?.toTrimmedString()).toBe('100500.55');
  });
});

describe('parseTarget', () => {
  it('holds a sub-cent level exactly', () => {
    // The whole reason the column is `numeric` and the field is `Money`: a float
    // target of 0.00002341 does not round-trip, and the alert fires at a level the
    // customer never chose.
    expect(parseTarget('0.00002341').toDecimalString()).toBe('0.00002341');
  });

  it('refuses text that is not a decimal', () => {
    expect(() => parseTarget('one hundred')).toThrow(TypeError);
    expect(() => parseTarget('')).toThrow(TypeError);
  });
});
