import 'server-only';

import { cache } from 'react';

import { createMarketDataModule } from '@/modules/market-data/server';
import {
  getMarketBySlug,
  listInstruments,
  listMarkets,
  type InstrumentDto,
  type ListInstrumentsOptions,
  type ListMarketsOptions,
  type MarketDto,
} from '@/modules/market-data';

/**
 * The application's read facade over market data.
 *
 * Pages call these functions. They do not build a module, and they do not know
 * that a repository exists — that is the point of the barrel. Everything here
 * is a thin binding of a module query to the composed module.
 *
 * `React.cache` deduplicates within a single render pass: the home page's price
 * strip and its market preview both ask for the same rows, and this collapses
 * that into one database round trip. It is per-request memoisation, not a cache
 * with a lifetime — nothing here survives the response, so a price is never
 * served from a previous request's memory.
 */

const marketData = cache(() => createMarketDataModule());

export const getMarkets = cache(
  async (options: ListMarketsOptions = {}): Promise<MarketDto[]> => {
    const context = marketData();
    return listMarkets(
      { instruments: context.instruments, tickers: context.tickers, clock: context.clock },
      options,
    );
  },
);

/** Returns the market for a slug, or null when no such asset is listed. */
export const getMarket = cache(async (slug: string): Promise<MarketDto | null> => {
  const context = marketData();
  const result = await getMarketBySlug(
    { instruments: context.instruments, tickers: context.tickers, clock: context.clock },
    slug,
  );
  return result.ok ? result.value : null;
});

/** Catalogue entries with no price attached — see `listInstruments`. */
export const getInstruments = cache(
  async (options: ListInstrumentsOptions = {}): Promise<InstrumentDto[]> =>
    listInstruments(marketData().instruments, options),
);
