import 'server-only';

import { systemClock, type Clock } from '@/shared/kernel';

import type {
  InstrumentRepository,
  MarketDataFeed,
  OrderBookFeed,
  TickerRepository,
  YieldFeed,
} from './application/ports';
import { BinanceBookFeed } from './infrastructure/feeds/binance-book-feed';
import { CoinGeckoFeed } from './infrastructure/feeds/coingecko-feed';
import { DefiLlamaYieldFeed } from './infrastructure/feeds/defillama-yield-feed';
import {
  CatalogueInstrumentRepository,
  DrizzleTickerRepository,
} from './infrastructure/persistence/repositories';

/**
 * Composition for this module.
 *
 * The wiring of interface to implementation happens here and nowhere else. This
 * is the one file that is allowed to know both sides, which is what keeps the
 * dependency rule true everywhere else: the application layer names only its
 * ports, the adapters name only the domain, and the two meet in this function.
 *
 * Swapping Postgres for something else, or CoinGecko for another provider, is a
 * change to this file alone.
 */

export interface MarketDataModule {
  readonly instruments: InstrumentRepository;
  readonly tickers: TickerRepository;
  readonly feed: MarketDataFeed;
  /**
   * The live venue: depth, candles and the tape.
   *
   * A separate port from `feed`, because the two have opposite cadences. Tickers
   * are polled on a schedule and written to a table; a book is read at request
   * time and never stored, since a stored order book is wrong before the write
   * returns.
   */
  readonly book: OrderBookFeed;
  /** Observed staking yields. Replaces the editorial number in the catalogue. */
  readonly yields: YieldFeed;
  readonly clock: Clock;
}

export function createMarketDataModule(clock: Clock = systemClock): MarketDataModule {
  return {
    instruments: new CatalogueInstrumentRepository(),
    tickers: new DrizzleTickerRepository(),
    feed: new CoinGeckoFeed(clock),
    book: new BinanceBookFeed(clock),
    yields: new DefiLlamaYieldFeed(clock),
    clock,
  };
}
