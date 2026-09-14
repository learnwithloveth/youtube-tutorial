import { secondsBetween, type Clock, type Money } from '@/shared/kernel';

/**
 * The live book: what is bid, what is offered, and what has just traded.
 *
 * ── Observations, with the same discipline as a price ──────────────────────────
 * A book is a snapshot of one instant, and it is stale faster than anything else
 * in this module — measured in seconds, not minutes. So it carries `observedAt`
 * and there is no constructor that produces one without it, for exactly the reason
 * `Ticker` has the same rule: a depth chart with no attached time is a claim about
 * the market that cannot be checked.
 *
 * ── The quote asset is carried, not assumed ────────────────────────────────────
 * These books are quoted in **USDT**, not dollars. USDT trades near a dollar and is
 * not one, and the difference is a real basis that widens exactly when it matters.
 * Labelling a USDT book as USD would be a small lie told on a trading screen, so
 * the quote currency travels with the data and the UI prints it.
 */

/** How old a book may be before it must stop being presented as the live market. */
export const MAX_BOOK_AGE_SECONDS = 30;

export interface PriceLevel {
  readonly price: Money;
  /** Size at this level, in the base asset. */
  readonly size: Money;
}

export interface OrderBookSnapshot {
  readonly symbol: string;
  readonly quoteCurrency: string;
  /** Highest first — the best bid is the one a seller hits. */
  readonly bids: readonly PriceLevel[];
  /** Lowest first — the best ask is the one a buyer lifts. */
  readonly asks: readonly PriceLevel[];
  readonly observedAt: Date;
}

export class OrderBook {
  readonly symbol: string;
  readonly quoteCurrency: string;
  readonly bids: readonly PriceLevel[];
  readonly asks: readonly PriceLevel[];
  readonly observedAt: Date;

  private constructor(snapshot: OrderBookSnapshot) {
    this.symbol = snapshot.symbol;
    this.quoteCurrency = snapshot.quoteCurrency;
    this.bids = snapshot.bids;
    this.asks = snapshot.asks;
    this.observedAt = snapshot.observedAt;
  }

  static create(snapshot: OrderBookSnapshot): OrderBook {
    if (Number.isNaN(snapshot.observedAt.getTime())) {
      throw new TypeError('An order book requires a valid observation time.');
    }
    return new OrderBook(snapshot);
  }

  get bestBid(): Money | null {
    return this.bids[0]?.price ?? null;
  }

  get bestAsk(): Money | null {
    return this.asks[0]?.price ?? null;
  }

  /**
   * The gap between the best bid and the best ask.
   *
   * Null when either side is empty, which is not a zero spread — it is a market
   * with nothing on one side, and rendering that as zero would say the opposite of
   * what is true.
   */
  get spread(): Money | null {
    const bid = this.bestBid;
    const ask = this.bestAsk;
    if (bid === null || ask === null) return null;
    return ask.subtract(bid);
  }

  isStaleAt(clock: Clock, maxAgeSeconds: number = MAX_BOOK_AGE_SECONDS): boolean {
    return secondsBetween(clock.now(), this.observedAt) > maxAgeSeconds;
  }
}

/** One period of trading. Times are the period's open. */
export interface Candle {
  readonly openTime: Date;
  readonly open: Money;
  readonly high: Money;
  readonly low: Money;
  readonly close: Money;
  /** Volume in the base asset. */
  readonly volume: Money;
}

/** A trade that actually happened, as reported by the venue. */
export interface PublicTrade {
  readonly id: string;
  readonly price: Money;
  readonly quantity: Money;
  readonly at: Date;
  /**
   * Which side crossed the spread.
   *
   * `buy` means a buyer lifted an offer. Derived from the venue's maker flag
   * rather than guessed from a price move, because a sequence of equal prices is
   * common and tells you nothing about who was aggressive.
   */
  readonly side: 'buy' | 'sell';
}

/** Periods the venue is asked for. Kept small: each one is a separate request. */
export type CandleInterval = '5m' | '1h' | '4h' | '1d';

export const CANDLE_INTERVALS: readonly CandleInterval[] = ['5m', '1h', '4h', '1d'];
