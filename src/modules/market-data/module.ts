import 'server-only';

import { systemClock, type Clock } from '@/shared/kernel';

import type {
  InstrumentRepository,
  MarketDataFeed,
  TickerRepository,
} from './application/ports';
import { CoinGeckoFeed } from './infrastructure/feeds/coingecko-feed';
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
  readonly clock: Clock;
}

export function createMarketDataModule(clock: Clock = systemClock): MarketDataModule {
  return {
    instruments: new CatalogueInstrumentRepository(),
    tickers: new DrizzleTickerRepository(),
    feed: new CoinGeckoFeed(clock),
    clock,
  };
}
