import { err, ok, type Result } from '@/shared/kernel';

import type { MarketDataError } from '../../domain/errors';
import type { InstrumentRepository, MarketDataFeed, TickerRepository } from '../ports';

/**
 * Pulls current quotes from the upstream feed and records them.
 *
 * This is the only writer of ticker data in the system, and it is a command:
 * triggered by a scheduled request to `POST /api/market-data/refresh`, never by
 * a page render. Fetching during render would put a third-party API on the
 * critical path of every visitor and make page latency depend on someone else's
 * uptime.
 *
 * A feed failure is returned, not thrown. The caller is a route handler that
 * should answer 503 and let the scheduler retry, while the site keeps serving
 * the last good observations — correctly labelled stale by `Market`.
 */

export interface RefreshTickersDependencies {
  readonly instruments: InstrumentRepository;
  readonly tickers: TickerRepository;
  readonly feed: MarketDataFeed;
}

export interface RefreshTickersResult {
  readonly instrumentsRequested: number;
  readonly quotesRecorded: number;
}

export async function refreshTickers(
  deps: RefreshTickersDependencies,
): Promise<Result<RefreshTickersResult, MarketDataError>> {
  const instruments = await deps.instruments.listListed();
  if (instruments.length === 0) {
    return ok({ instrumentsRequested: 0, quotesRecorded: 0 });
  }

  const quotes = await deps.feed.fetchQuotes(instruments);
  if (!quotes.ok) return err(quotes.error);

  // An empty response is not an error — the upstream may simply not cover any
  // of our listings today — but there is nothing to write, so skip the round
  // trip rather than issuing an empty statement.
  if (quotes.value.length > 0) {
    await deps.tickers.record(quotes.value);
  }

  return ok({
    instrumentsRequested: instruments.length,
    quotesRecorded: quotes.value.length,
  });
}
