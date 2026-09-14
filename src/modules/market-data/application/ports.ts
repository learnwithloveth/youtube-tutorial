import type { Result } from '@/shared/kernel';

import type { AssetSymbol } from '../domain/asset-symbol';
import type { MarketDataError } from '../domain/errors';
import type { Instrument } from '../domain/instrument';
import type {
  Candle,
  CandleInterval,
  OrderBook,
  PublicTrade,
} from '../domain/order-book';
import type { StakingYield } from '../domain/staking-yield';
import type { Ticker, TickerSnapshot } from '../domain/ticker';

/**
 * Ports — what this module *needs*, declared by this module.
 *
 * The direction matters and is the whole of the dependency rule. These
 * interfaces live in the application layer and are written in terms of domain
 * types, so nothing here mentions Drizzle, Postgres, HTTP or CoinGecko. The
 * adapters in `infrastructure/` implement them, which means infrastructure
 * depends on the application layer and never the reverse.
 *
 * The practical payoff: the use cases below are tested against in-memory
 * implementations of these interfaces, with no database and no network, and the
 * tests still exercise the real rules.
 */

export interface InstrumentRepository {
  /** Every instrument currently listed for trading, in catalogue order. */
  listListed(): Promise<Instrument[]>;
  findBySlug(slug: string): Promise<Instrument | null>;
}

export interface TickerRepository {
  /**
   * Latest observation per symbol. Symbols with no observation are simply
   * absent from the map rather than mapped to a placeholder — the caller has to
   * confront the missing case.
   */
  latestFor(symbols: readonly AssetSymbol[]): Promise<Map<string, Ticker>>;
  /** Records a batch of observations, replacing any earlier one per symbol. */
  record(snapshots: readonly TickerSnapshot[]): Promise<void>;
}

export interface MarketDataFeed {
  /**
   * Fetches current quotes for the given instruments.
   *
   * Returns a `Result` because an unreachable or malformed upstream is an
   * expected condition on a page that must still render, not an exception.
   */
  fetchQuotes(
    instruments: readonly Instrument[],
  ): Promise<Result<TickerSnapshot[], MarketDataError>>;
}

/**
 * The live book, candles and recent trades for one market.
 *
 * A separate port from `MarketDataFeed`, not an addition to it, because the two
 * have opposite cadences and opposite failure costs. Tickers are polled on a
 * schedule and written to a table; a book is read at request time and never
 * stored, because a stored order book is wrong before the write returns.
 *
 * Every method returns null on failure rather than throwing. A trading screen with
 * no book is a screen that says so; one that throws is a page that does not render
 * at all, and the price and the balance on it were fine.
 */
export interface OrderBookFeed {
  fetchBook(symbol: AssetSymbol, depth: number): Promise<OrderBook | null>;
  fetchCandles(
    symbol: AssetSymbol,
    interval: CandleInterval,
    limit: number,
  ): Promise<Candle[] | null>;
  fetchTrades(symbol: AssetSymbol, limit: number): Promise<PublicTrade[] | null>;
}

/**
 * Observed staking yields.
 *
 * Returns every yield the source knows about for the assets asked for; choosing
 * between two pools for the same asset is a judgement the application layer makes,
 * not something an adapter should decide by picking one.
 */
export interface YieldFeed {
  fetchYields(symbols: readonly AssetSymbol[]): Promise<StakingYield[] | null>;
}
