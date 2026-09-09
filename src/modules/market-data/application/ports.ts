import type { Result } from '@/shared/kernel';

import type { AssetSymbol } from '../domain/asset-symbol';
import type { MarketDataError } from '../domain/errors';
import type { Instrument } from '../domain/instrument';
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
