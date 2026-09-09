import { err, ok, type Clock, type Result } from '@/shared/kernel';

import { instrumentNotFound, type MarketDataError } from '../../domain/errors';
import { Market } from '../../domain/market';
import { toMarketDto, type MarketDto } from '../dto';
import type { InstrumentRepository, TickerRepository } from '../ports';

/**
 * Read path for a single asset page.
 *
 * Returns a `Result` rather than `MarketDto | null` so the caller is told *why*
 * there is nothing to show. The asset page turns `instrument-not-found` into a
 * 404; a null would have left it guessing between "no such asset" and "asset
 * exists but the feed is down", which are different pages.
 */

export interface GetMarketDependencies {
  readonly instruments: InstrumentRepository;
  readonly tickers: TickerRepository;
  readonly clock: Clock;
}

export async function getMarketBySlug(
  deps: GetMarketDependencies,
  slug: string,
): Promise<Result<MarketDto, MarketDataError>> {
  const instrument = await deps.instruments.findBySlug(slug.toLowerCase());
  if (!instrument) return err(instrumentNotFound(slug));

  const latest = await deps.tickers.latestFor([instrument.symbol]);
  const market = Market.create(instrument, latest.get(instrument.symbol.value) ?? null);

  return ok(toMarketDto(market, deps.clock));
}
