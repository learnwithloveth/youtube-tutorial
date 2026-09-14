import 'server-only';

import { cache } from 'react';

import { createMarketDataModule } from '@/modules/market-data/server';
import { refreshTickers } from '@/modules/market-data';
import { logger } from '@/platform/observability/logger';
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

/**
 * ── The feed heals itself, because nothing was winding it ─────────────────────
 *
 * `/api/market-data/refresh` exists and works, and is meant to be called by a cron
 * roughly once a minute. Nothing was calling it. Quotes went five days stale,
 * every one of them failed the five-minute freshness test, and the consequences
 * landed a long way from the cause: portfolios showed "could not be priced",
 * and withdrawals stopped — because the ledger's oracle accepts only a *live*
 * quote and correctly refuses to let money leave against a stale one.
 *
 * A read path that depends on a scheduler somebody has to remember to configure
 * is a read path that will be stale again. So a read that *finds* the data stale
 * refreshes it. The cron endpoint stays — it is still the right way to keep quotes
 * warm ahead of demand — but the application no longer breaks without it.
 *
 * Three properties make this safe to put on a render path:
 *
 *  - **It costs nothing when healthy.** Freshness is judged from the rows the read
 *    already returned, so there is no extra query in the common case.
 *  - **One refresh at a time.** Concurrent requests share a single in-flight
 *    promise rather than each stampeding the upstream.
 *  - **It gives up quickly.** A slow or failing upstream is raced against a
 *    timeout and then left alone for a cooling-off period. A page renders with
 *    stale data — which the UI already says out loud — rather than hanging.
 */

/** How long a render will wait for the upstream before serving what it has. */
const REFRESH_TIMEOUT_MS = 4_000;

/** Quiet period after a failure, so a broken upstream is not hit on every request. */
const COOLDOWN_MS = 60_000;

/*
 * Module-level, which in a serverless runtime means per-instance. That is the
 * right scope: it is a stampede guard, not a cache. Two instances each making one
 * upstream call is fine; one instance making forty is not — and the write is
 * idempotent either way, so a duplicated refresh costs a request, not correctness.
 */
let inFlight: Promise<void> | null = null;
let lastAttemptAt = 0;

async function refreshOnce(): Promise<void> {
  const context = marketData();
  const result = await refreshTickers({
    instruments: context.instruments,
    tickers: context.tickers,
    feed: context.feed,
  });

  if (!result.ok) {
    logger.warn({
      event: 'ticker_autorefresh_failed',
      module: 'market-data',
      reason: result.error.kind,
    });
    return;
  }

  logger.info({ event: 'ticker_autorefresh', module: 'market-data', ...result.value });
}

/**
 * True when a refresh ran and wrote something worth re-reading.
 *
 * Staleness is read off the quote states the caller already has rather than from a
 * timestamp of our own — so the trigger is by construction the same rule the UI
 * and the ledger's oracle apply. A second threshold here would eventually disagree
 * with `MAX_TICKER_AGE_SECONDS`, and the failure would be a page that says
 * "stale" while the refresher considers everything fine.
 */
async function refreshIfStale(markets: readonly MarketDto[]): Promise<boolean> {
  // A listing with no quote at all counts as stale — that is a newly catalogued
  // asset the feed has never been asked for, which is exactly how TRX ended up
  // unpriceable while every other symbol had a row.
  const missing = markets.some((market) => market.quote.state === 'unavailable');
  const oldest = markets.some((market) => market.quote.state === 'stale');
  if (!missing && !oldest) return false;

  const now = Date.now();
  if (inFlight === null && now - lastAttemptAt > COOLDOWN_MS) {
    lastAttemptAt = now;
    inFlight = refreshOnce().finally(() => {
      inFlight = null;
    });
  }

  const running = inFlight;
  if (running === null) return false;

  // Raced, not awaited outright. An upstream that has started timing out must not
  // turn every page in the product into a four-second page.
  const finished = await Promise.race([
    running.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), REFRESH_TIMEOUT_MS)),
  ]);

  return finished;
}

export const getMarkets = cache(
  async (options: ListMarketsOptions = {}): Promise<MarketDto[]> => {
    const context = marketData();
    const read = async () =>
      listMarkets(
        { instruments: context.instruments, tickers: context.tickers, clock: context.clock },
        options,
      );

    const markets = await read();

    // Re-read only when a refresh actually completed. Reading again after a
    // timeout would cost a query to return the same rows.
    return (await refreshIfStale(markets)) ? read() : markets;
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
