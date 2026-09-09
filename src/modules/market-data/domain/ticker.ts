import { type BasisPoints, type Money, type Clock, type PriceDirection, secondsBetween } from '@/shared/kernel';

import type { AssetSymbol } from './asset-symbol';

/**
 * Ticker — one observation of a market, at one instant.
 *
 * The instant is not decoration. A price is a claim about the world at a moment,
 * and a price with no attached time is a claim with no expiry, which is how a
 * quote from three hours ago ends up presented as live. Every ticker therefore
 * carries `observedAt`, and the only way to ask whether it may be shown as
 * current is `isStaleAt`, which requires a clock.
 *
 * There is no constructor path that produces a ticker without an observation
 * time, and no path that produces one from an invented price.
 */

export interface TickerSnapshot {
  readonly symbol: AssetSymbol;
  readonly price: Money;
  readonly change24h: BasisPoints;
  readonly change7d: BasisPoints;
  readonly marketCap: Money | null;
  readonly volume24h: Money | null;
  readonly circulatingSupply: bigint | null;
  /**
   * The 7-day price shape, normalised to 0..1 for drawing.
   *
   * Derived from real hourly observations upstream, not generated. It is a
   * *shape* rather than a price series — the values are rescaled so a sparkline
   * can be drawn without another scale conversion — which is why it is separate
   * from `price` and never used for arithmetic. Null when the feed did not
   * supply history, in which case no line is drawn at all.
   */
  readonly sparkline: readonly number[] | null;
  readonly observedAt: Date;
}

/**
 * How old a quote may be before the UI must stop calling it live.
 *
 * Five minutes is chosen against the refresh cadence, not against what looks
 * good: the feed is polled every minute, so anything past five has missed
 * several cycles and something is wrong upstream.
 */
export const MAX_TICKER_AGE_SECONDS = 300;

export class Ticker {
  readonly symbol: AssetSymbol;
  readonly price: Money;
  readonly change24h: BasisPoints;
  readonly change7d: BasisPoints;
  readonly marketCap: Money | null;
  readonly volume24h: Money | null;
  readonly circulatingSupply: bigint | null;
  readonly sparkline: readonly number[] | null;
  readonly observedAt: Date;

  private constructor(snapshot: TickerSnapshot) {
    this.symbol = snapshot.symbol;
    this.price = snapshot.price;
    this.change24h = snapshot.change24h;
    this.change7d = snapshot.change7d;
    this.marketCap = snapshot.marketCap;
    this.volume24h = snapshot.volume24h;
    this.circulatingSupply = snapshot.circulatingSupply;
    this.sparkline = snapshot.sparkline;
    this.observedAt = snapshot.observedAt;
  }

  static create(snapshot: TickerSnapshot): Ticker {
    if (snapshot.price.isNegative) {
      throw new RangeError(`A price cannot be negative: ${snapshot.price.toString()}`);
    }
    if (Number.isNaN(snapshot.observedAt.getTime())) {
      throw new TypeError('A ticker requires a valid observation time.');
    }
    return new Ticker(snapshot);
  }

  /** Which way the 24-hour move went — what the UI colours on. */
  get direction(): PriceDirection {
    return this.change24h.direction;
  }

  get ageInSecondsAt(): (clock: Clock) => number {
    return (clock: Clock) => secondsBetween(clock.now(), this.observedAt);
  }

  /**
   * Whether this observation is too old to present as the current price.
   *
   * Callers that render a price must branch on this. Showing a stale quote
   * unlabelled is the failure mode this whole type is built to prevent.
   */
  isStaleAt(clock: Clock, maxAgeSeconds: number = MAX_TICKER_AGE_SECONDS): boolean {
    return secondsBetween(clock.now(), this.observedAt) > maxAgeSeconds;
  }
}
