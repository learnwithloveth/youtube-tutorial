/**
 * BasisPoints — a rate held as an integer hundredth of a percent.
 *
 * Percentage changes have the same problem as money: `0.1 + 0.2` is not `0.3`,
 * and a "+2.41%" that renders as "+2.4099999999999997%" destroys trust on a page
 * whose entire job is to look precise. One basis point is 0.01%, which is the
 * finest granularity this product ever quotes, so an integer count of them is
 * exact for every rate we display.
 *
 *   +2.41%  →  241 bp
 *   -0.05%  →   -5 bp
 *   +12.4%  → 1240 bp
 */

const BASIS_POINTS_PER_PERCENT = 100;

export class BasisPoints {
  private constructor(readonly value: number) {}

  static of(value: number): BasisPoints {
    if (!Number.isInteger(value)) {
      throw new TypeError(`BasisPoints must be a whole number, received ${value}`);
    }
    return new BasisPoints(value);
  }

  static zero(): BasisPoints {
    return new BasisPoints(0);
  }

  /**
   * Converts a percentage figure to basis points, rounding to the nearest whole
   * point. Rounding is correct here: the input is already an approximation of a
   * rate, and 0.01% is below the precision anything is quoted at.
   */
  static fromPercent(percent: number): BasisPoints {
    if (!Number.isFinite(percent)) {
      throw new TypeError(`BasisPoints.fromPercent received a non-finite number: ${percent}`);
    }
    return new BasisPoints(Math.round(percent * BASIS_POINTS_PER_PERCENT));
  }

  get isPositive(): boolean {
    return this.value > 0;
  }

  get isNegative(): boolean {
    return this.value < 0;
  }

  get isZero(): boolean {
    return this.value === 0;
  }

  /** Which way a price moved — the tri-state the UI colours on. */
  get direction(): PriceDirection {
    if (this.value > 0) return 'up';
    if (this.value < 0) return 'down';
    return 'flat';
  }

  /** The rate as a percentage number, for `Intl` at the presentation edge. */
  toPercentForDisplay(): number {
    return this.value / BASIS_POINTS_PER_PERCENT;
  }

  toString(): string {
    return `${this.value} bp`;
  }
}

export type PriceDirection = 'up' | 'down' | 'flat';
