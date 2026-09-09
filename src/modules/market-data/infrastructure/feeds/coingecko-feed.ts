import 'server-only';

import { z } from 'zod';

import { env } from '@/platform/env';
import { BasisPoints, Money, err, ok, type Clock, type Result } from '@/shared/kernel';

import type { MarketDataFeed } from '../../application/ports';
import {
  feedResponseInvalid,
  feedUnavailable,
  type MarketDataError,
} from '../../domain/errors';
import type { Instrument } from '../../domain/instrument';
import type { TickerSnapshot } from '../../domain/ticker';
import { INSTRUMENT_BY_FEED_ID } from '../catalogue/instrument-catalogue';

/**
 * CoinGecko adapter.
 *
 * The upstream sends JSON numbers, which are already floats by the time they
 * reach us — nothing can recover the digits JSON parsing dropped. What we *can*
 * do is stop the damage spreading: each value is converted straight to `Money`
 * at a declared scale here, at the edge, and travels as an exact integer from
 * this line onward. This adapter is the only place in the codebase where a price
 * exists as a `number`, and it is the reason `fromUnsafeNumber` is named that.
 *
 * Every field is validated before use. An upstream is not a contract we control:
 * it can add fields, drop them, or return `null` for an asset it stopped
 * tracking, and none of that should throw inside a page render.
 */

const quoteSchema = z.object({
  id: z.string(),
  current_price: z.number().finite().nonnegative().nullable(),
  price_change_percentage_24h: z.number().finite().nullable().default(null),
  price_change_percentage_7d_in_currency: z.number().finite().nullable().default(null),
  market_cap: z.number().finite().nonnegative().nullable().default(null),
  total_volume: z.number().finite().nonnegative().nullable().default(null),
  circulating_supply: z.number().finite().nonnegative().nullable().default(null),
  last_updated: z.string().nullable().default(null),
  sparkline_in_7d: z
    .object({ price: z.array(z.number().finite()).nullable().default(null) })
    .nullable()
    .default(null),
});

const responseSchema = z.array(quoteSchema);

const QUOTE_CURRENCY = 'USD';
const REQUEST_TIMEOUT_MS = 8_000;

/** Points kept from the upstream's 168 hourly samples. Matches the design. */
const SPARKLINE_POINTS = 48;

export class CoinGeckoFeed implements MarketDataFeed {
  constructor(private readonly clock: Clock) {}

  async fetchQuotes(
    instruments: readonly Instrument[],
  ): Promise<Result<TickerSnapshot[], MarketDataError>> {
    if (instruments.length === 0) return ok([]);

    const config = env();
    const url = new URL(`${config.MARKET_DATA_FEED_URL}/coins/markets`);
    url.searchParams.set('vs_currency', QUOTE_CURRENCY.toLowerCase());
    url.searchParams.set('ids', instruments.map((instrument) => instrument.feedId).join(','));
    url.searchParams.set('price_change_percentage', '24h,7d');
    url.searchParams.set('sparkline', 'true');
    url.searchParams.set('precision', 'full');

    let payload: unknown;
    try {
      // An unbounded fetch to a third party can hang a request handler
      // indefinitely; the timeout turns that into an ordinary failure.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: 'application/json',
          ...(config.MARKET_DATA_FEED_API_KEY
            ? { 'x-cg-demo-api-key': config.MARKET_DATA_FEED_API_KEY }
            : {}),
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        return err(feedUnavailable(`upstream responded ${response.status}`));
      }
      payload = await response.json();
    } catch (cause) {
      return err(feedUnavailable(cause instanceof Error ? cause.message : 'network failure'));
    }

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      return err(feedResponseInvalid(parsed.error.issues[0]?.message ?? 'unrecognised shape'));
    }

    const observedFallback = this.clock.now();
    const snapshots: TickerSnapshot[] = [];

    for (const quote of parsed.data) {
      const instrument = INSTRUMENT_BY_FEED_ID.get(quote.id);
      // An asset we do not list is not an error — the upstream is free to
      // return more than we asked about. Skip it.
      if (!instrument) continue;
      // No price means no observation. Recording a zero here would be inventing
      // a quote, which is the one thing this module must never do.
      if (quote.current_price === null) continue;

      snapshots.push({
        symbol: instrument.symbol,
        price: Money.fromUnsafeNumber(
          quote.current_price,
          QUOTE_CURRENCY,
          instrument.priceScale,
        ),
        change24h: BasisPoints.fromPercent(quote.price_change_percentage_24h ?? 0),
        change7d: BasisPoints.fromPercent(quote.price_change_percentage_7d_in_currency ?? 0),
        marketCap:
          quote.market_cap === null
            ? null
            : Money.fromUnsafeNumber(quote.market_cap, QUOTE_CURRENCY, 2),
        volume24h:
          quote.total_volume === null
            ? null
            : Money.fromUnsafeNumber(quote.total_volume, QUOTE_CURRENCY, 2),
        circulatingSupply:
          quote.circulating_supply === null
            ? null
            : BigInt(Math.trunc(quote.circulating_supply)),
        sparkline: toSparklineShape(quote.sparkline_in_7d?.price ?? null),
        observedAt: parseInstant(quote.last_updated) ?? observedFallback,
      });
    }

    return ok(snapshots);
  }
}

/**
 * Reduces the upstream's 7-day hourly prices to a drawable shape.
 *
 * Two steps, both presentational. Downsampling to 48 points keeps the stored
 * payload small and matches the resolution the design draws at. Normalising to
 * 0..1 rescales the curve to its own range, which is what makes a $94,000 asset
 * and a $0.60 one legible in identically sized cells.
 *
 * A flat series maps to a flat line at the midpoint rather than dividing by a
 * zero range — a stablecoin that genuinely did not move should look like it did
 * not move, not like a random walk.
 */
function toSparklineShape(prices: number[] | null): number[] | null {
  if (!prices || prices.length < 2) return null;

  const step = (prices.length - 1) / (SPARKLINE_POINTS - 1);
  const sampled: number[] = [];
  for (let i = 0; i < SPARKLINE_POINTS; i += 1) {
    const value = prices[Math.round(i * step)];
    if (value === undefined || !Number.isFinite(value)) return null;
    sampled.push(value);
  }

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min;
  if (span === 0) return sampled.map(() => 0.5);

  return sampled.map((value) => Number(((value - min) / span).toFixed(4)));
}

function parseInstant(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
