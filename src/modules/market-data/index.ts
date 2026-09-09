/**
 * Public barrel — the market-data module's entire contract.
 *
 * `app/` imports from `@/modules/market-data` and never from a path inside it.
 * Everything not re-exported here is internal: the domain entities, the Drizzle
 * adapters, the feed client. That restriction is what makes the module
 * replaceable — nothing outside can depend on how it works, only on what it
 * offers.
 *
 * Note that no domain object is exported. Callers get DTOs, because a page that
 * could hold a `Ticker` would be able to reach past the freshness rules that
 * `Market.quoteStateAt` exists to enforce.
 *
 * Everything here is safe to import from a Client Component: types, DTOs, pure
 * query functions and the conversion service, none of which touch the database
 * or the network. Composition lives in `./server`, which is `server-only` — see
 * that file for why the split exists.
 */

export type { MarketDto, QuoteDto, InstrumentDto } from './application/dto';
export type { MarketCategory } from './domain/instrument';
export { MARKET_CATEGORIES } from './domain/instrument';
export type { MarketDataError } from './domain/errors';
export { MAX_TICKER_AGE_SECONDS } from './domain/ticker';

/* The conversion estimator is pure and framework-free, so the buy/sell widget
   can use it on the client and keep its arithmetic exact. */
export { estimateConversion, QUANTITY_SCALE } from './domain/conversion';
export type { ConversionEstimate } from './domain/conversion';

export { listMarkets } from './application/queries/list-markets';
export type { ListMarketsOptions } from './application/queries/list-markets';
export { getMarketBySlug } from './application/queries/get-market';
export { listInstruments } from './application/queries/list-instruments';
export type { ListInstrumentsOptions } from './application/queries/list-instruments';
export { refreshTickers } from './application/use-cases/refresh-tickers';
export type { RefreshTickersResult } from './application/use-cases/refresh-tickers';
