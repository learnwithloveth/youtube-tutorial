import type { Clock } from '@/shared/kernel';

import { Market } from '../../domain/market';
import { toMarketDto, type MarketDto } from '../dto';
import type { InstrumentRepository, TickerRepository } from '../ports';

/**
 * Read path for every surface that lists markets.
 *
 * This is a query, not a use case: it changes nothing, returns DTOs, and is safe
 * to call during render. Keeping reads on their own path means Server Components
 * can await it directly without the ceremony a command needs (idempotency keys,
 * authorisation, transactions), and no page ever mutates while rendering.
 *
 * Instruments and tickers are fetched separately and joined here rather than in
 * SQL. That is deliberate: the instrument list is editorial and effectively
 * static, so it caches for a long time, while tickers turn over every minute.
 * A single join would force the whole result to the shorter lifetime.
 */

export interface ListMarketsDependencies {
  readonly instruments: InstrumentRepository;
  readonly tickers: TickerRepository;
  readonly clock: Clock;
}

export interface ListMarketsOptions {
  /** Restrict to one category, as the markets page filter does. */
  readonly category?: string;
  readonly limit?: number;
}

export async function listMarkets(
  deps: ListMarketsDependencies,
  options: ListMarketsOptions = {},
): Promise<MarketDto[]> {
  const instruments = await deps.instruments.listListed();

  const filtered = options.category
    ? instruments.filter((instrument) => instrument.category === options.category)
    : instruments;

  const limited = options.limit ? filtered.slice(0, options.limit) : filtered;
  if (limited.length === 0) return [];

  const latest = await deps.tickers.latestFor(limited.map((instrument) => instrument.symbol));

  return limited.map((instrument) =>
    toMarketDto(
      Market.create(instrument, latest.get(instrument.symbol.value) ?? null),
      deps.clock,
    ),
  );
}
