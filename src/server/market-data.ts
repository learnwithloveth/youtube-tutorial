import 'server-only';

import { cache } from 'react';

import { createMarketDataModule } from '@/modules/market-data/server';
import {
  getCandles,
  getOrderBook,
  getRecentTrades,
  getStakingYields,
  getMarketBySlug,
  listInstruments,
  listMarkets,
  type InstrumentDto,
  type ListInstrumentsOptions,
  type CandleDto,
  type CandleInterval,
  type ListMarketsOptions,
  type MarketDto,
  type OrderBookDto,
  type PublicTradeDto,
  type StakingYieldDto,
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

/**
 * The live venue.
 *
 * ── Not wrapped in `React.cache`, unlike the reads above ──────────────────────
 * `cache` deduplicates within one render, which is right for a ticker table two
 * components both need. A book is different: it is the most volatile thing on the
 * platform, and the cost of reading it twice in one render is one HTTP request
 * while the cost of *memoising* it is a trading screen quietly showing one
 * component a book the other has already moved past.
 *
 * Every one of these returns null or an empty list on failure rather than
 * throwing. A trading page that has lost its book says so; the price and the
 * balance next to it were never in question.
 */

/**
 * Resolves a ticker against the catalogue.
 *
 * Validated against what we actually list rather than merely parsed as a symbol:
 * a request for a well-formed ticker we do not carry should not reach an upstream
 * at all. The catalogue is in code, so this costs a lookup and no I/O.
 */
const listedSymbol = cache(async (symbol: string) => {
  const wanted = symbol.trim().toUpperCase();
  const instruments = await marketData().instruments.listListed();
  return instruments.find((instrument) => instrument.symbol.value === wanted)?.symbol ?? null;
});

/** The order book for one asset, or null when the venue did not answer. */
export async function getBook(symbol: string, depth = 20): Promise<OrderBookDto | null> {
  const resolved = await listedSymbol(symbol);
  if (resolved === null) return null;

  const context = marketData();
  return getOrderBook(context.book, context.clock, resolved, depth);
}

export async function getMarketCandles(
  symbol: string,
  interval: CandleInterval = '1h',
  limit = 120,
): Promise<CandleDto[] | null> {
  const resolved = await listedSymbol(symbol);
  if (resolved === null) return null;

  return getCandles(marketData().book, resolved, interval, limit);
}

export async function getTape(symbol: string, limit = 30): Promise<PublicTradeDto[] | null> {
  const resolved = await listedSymbol(symbol);
  if (resolved === null) return null;

  return getRecentTrades(marketData().book, resolved, limit);
}

/**
 * Observed staking yields for the assets we list.
 *
 * Deduplicated per request and cached for an hour in the adapter: the upstream
 * returns every pool it tracks in one multi-megabyte response, so this is the one
 * read here where caching is the difference between a useful free API and an
 * outage we caused ourselves.
 */
export const getYields = cache(async (): Promise<StakingYieldDto[]> => {
  const context = marketData();
  const instruments = await context.instruments.listListed();

  return getStakingYields(
    context.yields,
    instruments.map((instrument) => instrument.symbol),
  );
});
