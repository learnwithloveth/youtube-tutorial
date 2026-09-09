import { describe, expect, it } from 'vitest';

import { BasisPoints } from '../basis-points';

describe('BasisPoints', () => {
  it('converts a percentage to whole basis points', () => {
    expect(BasisPoints.fromPercent(2.41).value).toBe(241);
    expect(BasisPoints.fromPercent(-0.05).value).toBe(-5);
    expect(BasisPoints.fromPercent(12.4).value).toBe(1240);
  });

  it('renders back to the percentage it came from', () => {
    // The float that motivates this type: 2.41 * 100 is 240.99999999999997,
    // so the round-trip only holds because the intermediate is an integer.
    expect(BasisPoints.fromPercent(2.41).toPercentForDisplay()).toBe(2.41);
    expect(BasisPoints.fromPercent(33.8).toPercentForDisplay()).toBe(33.8);
  });

  it('reports direction as the tri-state the UI colours on', () => {
    expect(BasisPoints.fromPercent(2.41).direction).toBe('up');
    expect(BasisPoints.fromPercent(-1.24).direction).toBe('down');
    expect(BasisPoints.zero().direction).toBe('flat');
  });

  it('treats a rate below a basis point as flat rather than inventing movement', () => {
    expect(BasisPoints.fromPercent(0.001).direction).toBe('flat');
  });

  it('refuses a fractional basis point', () => {
    expect(() => BasisPoints.of(2.5)).toThrow(TypeError);
  });

  it('rejects non-finite input', () => {
    expect(() => BasisPoints.fromPercent(Number.NaN)).toThrow(TypeError);
  });
});
