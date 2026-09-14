import type { Clock, Money } from '@/shared/kernel';

import type { AssetSymbol } from '../../domain/asset-symbol';
import type { CandleInterval, PriceLevel } from '../../domain/order-book';
import { MAX_BOOK_AGE_SECONDS } from '../../domain/order-book';
import type { OrderBookFeed, YieldFeed } from '../ports';

/**
 * Reads of the live venue: the book, the candles, the tape, the yields.
 *
 * ── Why these do not return `Result` ───────────────────────────────────────────
 * Every one of them returns null on failure, because there is exactly one thing a
 * caller can do about a missing book and the type should not pretend otherwise:
 * render the absence. The three-way `live | stale | unavailable` that prices get
 * would be over-modelled here — a book older than thirty seconds is not stale, it
 * is worthless, so the freshness check collapses to a boolean and an absent book.
 */

export interface PriceLevelDto {
  /** Exact decimal strings. Charts convert at the render edge, not here. */
  readonly price: string;
  readonly size: string;
  /** Running depth from the top of the book — what a depth chart plots. */
  readonly total: string;
}

export interface OrderBookDto {
  readonly symbol: string;
  /** USDT, not USD. Printed rather than implied — see `OrderBook`. */
  readonly quoteCurrency: string;
  readonly bids: readonly PriceLevelDto[];
  readonly asks: readonly PriceLevelDto[];
  readonly bestBid: string | null;
  readonly bestAsk: string | null;
  readonly spread: string | null;
  readonly observedAt: string;
}

export interface CandleDto {
  readonly openTime: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

export interface PublicTradeDto {
  readonly id: string;
  readonly price: string;
  readonly quantity: string;
  readonly at: string;
  readonly side: 'buy' | 'sell';
}

export interface StakingYieldDto {
  readonly symbol: string;
  readonly protocol: string;
  readonly chain: string;
  /** Percent, e.g. `2.24`. Derived from basis points, so exact to 2dp. */
  readonly apyPercent: number;
  readonly baseApyPercent: number | null;
  readonly rewardApyPercent: number | null;
  readonly tvlUsd: number;
  readonly poolSymbol: string;
  readonly observedAt: string;
}

export async function getOrderBook(
  feed: OrderBookFeed,
  clock: Clock,
  symbol: AssetSymbol,
  depth = 20,
): Promise<OrderBookDto | null> {
  const book = await feed.fetchBook(symbol, depth);
  if (book === null) return null;

  // A book this old is not "stale" in the way a price is — nobody could trade on
  // it and showing it with a caveat would still be showing a fiction.
  if (book.isStaleAt(clock, MAX_BOOK_AGE_SECONDS)) return null;

  return {
    symbol: book.symbol,
    quoteCurrency: book.quoteCurrency,
    bids: withRunningTotal(book.bids),
    asks: withRunningTotal(book.asks),
    bestBid: book.bestBid?.toDecimalString() ?? null,
    bestAsk: book.bestAsk?.toDecimalString() ?? null,
    spread: book.spread?.toDecimalString() ?? null,
    observedAt: book.observedAt.toISOString(),
  };
}

/**
 * Accumulates size down each side of the book.
 *
 * Done here rather than in the chart because it is exact-decimal arithmetic on
 * sizes, and doing it at the render edge would mean summing floats — the one
 * operation on this page most likely to drift visibly as depth grows.
 */
function withRunningTotal(levels: readonly PriceLevel[]): PriceLevelDto[] {
  const out: PriceLevelDto[] = [];
  let running: Money | null = null;

  for (const level of levels) {
    running = running === null ? level.size : running.add(level.size);
    out.push({
      price: level.price.toDecimalString(),
      size: level.size.toDecimalString(),
      total: running.toDecimalString(),
    });
  }

  return out;
}

export async function getCandles(
  feed: OrderBookFeed,
  symbol: AssetSymbol,
  interval: CandleInterval,
  limit = 120,
): Promise<CandleDto[] | null> {
  const candles = await feed.fetchCandles(symbol, interval, limit);
  if (candles === null) return null;

  return candles.map((candle) => ({
    openTime: candle.openTime.toISOString(),
    open: candle.open.toDecimalString(),
    high: candle.high.toDecimalString(),
    low: candle.low.toDecimalString(),
    close: candle.close.toDecimalString(),
    volume: candle.volume.toDecimalString(),
  }));
}

export async function getRecentTrades(
  feed: OrderBookFeed,
  symbol: AssetSymbol,
  limit = 30,
): Promise<PublicTradeDto[] | null> {
  const trades = await feed.fetchTrades(symbol, limit);
  if (trades === null) return null;

  return trades.map((trade) => ({
    id: trade.id,
    price: trade.price.toDecimalString(),
    quantity: trade.quantity.toDecimalString(),
    at: trade.at.toISOString(),
    side: trade.side,
  }));
}

export async function getStakingYields(
  feed: YieldFeed,
  symbols: readonly AssetSymbol[],
): Promise<StakingYieldDto[]> {
  const yields = await feed.fetchYields(symbols);
  if (yields === null) return [];

  return yields
    .map((observed) => ({
      symbol: observed.symbol,
      protocol: observed.protocol,
      chain: observed.chain,
      apyPercent: observed.apy.toPercentForDisplay(),
      baseApyPercent: observed.baseApy?.toPercentForDisplay() ?? null,
      rewardApyPercent: observed.rewardApy?.toPercentForDisplay() ?? null,
      tvlUsd: observed.tvlUsd,
      poolSymbol: observed.poolSymbol,
      observedAt: observed.observedAt.toISOString(),
    }))
    .sort((a, b) => b.apyPercent - a.apyPercent);
}
