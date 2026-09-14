import 'server-only';

import { z } from 'zod';

import { logger } from '@/platform/observability/logger';
import { Money, type Clock } from '@/shared/kernel';

import type { AssetSymbol } from '../../domain/asset-symbol';
import type {
  Candle,
  CandleInterval,
  PriceLevel,
  PublicTrade,
} from '../../domain/order-book';
import { OrderBook } from '../../domain/order-book';
import type { OrderBookFeed } from '../../application/ports';

/**
 * Live depth, candles and trades from Binance's public market-data service.
 *
 * ── Why `data-api.binance.vision` and not `api.binance.com` ────────────────────
 * They serve the same public endpoints with the same shapes, and the `.vision`
 * host is the market-data-only mirror: no accounts, no trading, no API key, and —
 * the reason it is here — it is not subject to the jurisdictional blocking that
 * makes `api.binance.com` return nothing from large parts of the world. Probing
 * both from this machine, `api.binance.com` timed out at the connection and the
 * mirror answered in full.
 *
 * ── Everything arrives as exact decimal strings ────────────────────────────────
 * Binance quotes `"77722.00000000"`, not `77722`. That is the whole reason this
 * adapter can be honest about money: the value goes straight into `Money` without
 * ever being a float. Contrast `CoinGeckoFeed`, which receives JSON numbers and
 * has to admit the precision was already lost.
 *
 * ── The quote asset is USDT, and it is carried, not renamed ────────────────────
 * These are USDT pairs. USDT trades near a dollar and is not one, and the basis
 * widens exactly when a trading screen matters most. The quote currency travels
 * with the data so the UI can print it rather than implying dollars.
 */

const BASE_URL = 'https://data-api.binance.vision/api/v3';
const REQUEST_TIMEOUT_MS = 6_000;

/**
 * Our symbols to Binance's pairs.
 *
 * An explicit map rather than `${symbol}USDT`, because the naive version silently
 * produces a plausible pair that does not exist and the failure looks like an
 * outage. An asset absent from this map has no book here, which is a different and
 * honest answer.
 */
const PAIRS: Readonly<Record<string, string>> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  XRP: 'XRPUSDT',
  ADA: 'ADAUSDT',
  DOGE: 'DOGEUSDT',
  AVAX: 'AVAXUSDT',
  LINK: 'LINKUSDT',
  DOT: 'DOTUSDT',
  MATIC: 'MATICUSDT',
  ATOM: 'ATOMUSDT',
  NEAR: 'NEARUSDT',
  INJ: 'INJUSDT',
  LTC: 'LTCUSDT',
  UNI: 'UNIUSDT',
  AAVE: 'AAVEUSDT',
  ARB: 'ARBUSDT',
  OP: 'OPUSDT',
  SUI: 'SUIUSDT',
  TIA: 'TIAUSDT',
  SEI: 'SEIUSDT',
  RNDR: 'RNDRUSDT',
  IMX: 'IMXUSDT',
  LDO: 'LDOUSDT',
  FIL: 'FILUSDT',
};

const QUOTE_CURRENCY = 'USDT';
/** Decimal places prices and sizes are carried at. Binance sends eight. */
const FEED_SCALE = 8;

const levelSchema = z.tuple([z.string(), z.string()]);

const depthSchema = z.object({
  lastUpdateId: z.number(),
  bids: z.array(levelSchema),
  asks: z.array(levelSchema),
});

/**
 * A kline is a positional array, not an object.
 *
 * `[openTime, open, high, low, close, volume, closeTime, …]`. Validated by
 * position because that is what the wire format is; naming them here is what stops
 * the rest of the file indexing into a tuple.
 */
const klineSchema = z.tuple([
  z.number(), // open time
  z.string(), // open
  z.string(), // high
  z.string(), // low
  z.string(), // close
  z.string(), // volume
]).rest(z.unknown());

const tradeSchema = z.object({
  id: z.number(),
  price: z.string(),
  qty: z.string(),
  time: z.number(),
  /** True when the *buyer* was the maker — so the aggressor was a seller. */
  isBuyerMaker: z.boolean(),
});

export class BinanceBookFeed implements OrderBookFeed {
  constructor(private readonly clock: Clock) {}

  async fetchBook(symbol: AssetSymbol, depth: number): Promise<OrderBook | null> {
    const pair = PAIRS[symbol.value];
    if (pair === undefined) return null;

    const payload = await this.get(`/depth?symbol=${pair}&limit=${clamp(depth, 5, 100)}`);
    if (payload === null) return null;

    const parsed = depthSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn({ event: 'book_unparseable', module: 'market-data', symbol: symbol.value });
      return null;
    }

    return OrderBook.create({
      symbol: symbol.value,
      quoteCurrency: QUOTE_CURRENCY,
      bids: parsed.data.bids.map((level) => toLevel(level, symbol.value)),
      asks: parsed.data.asks.map((level) => toLevel(level, symbol.value)),
      // Binance's depth response carries an update id, not a timestamp. The
      // request just returned, so "now" is accurate to the round trip — and
      // pretending to a precision the payload does not contain would be worse.
      observedAt: this.clock.now(),
    });
  }

  async fetchCandles(
    symbol: AssetSymbol,
    interval: CandleInterval,
    limit: number,
  ): Promise<Candle[] | null> {
    const pair = PAIRS[symbol.value];
    if (pair === undefined) return null;

    const payload = await this.get(
      `/klines?symbol=${pair}&interval=${interval}&limit=${clamp(limit, 10, 500)}`,
      // Candles close on a schedule, so a short cache costs nothing and spares the
      // upstream a request per viewer. The open candle is a minute stale at worst.
      60,
    );
    if (payload === null) return null;

    const parsed = z.array(klineSchema).safeParse(payload);
    if (!parsed.success) {
      logger.warn({ event: 'candles_unparseable', module: 'market-data', symbol: symbol.value });
      return null;
    }

    return parsed.data.map((kline) => ({
      openTime: new Date(kline[0]),
      open: price(kline[1]),
      high: price(kline[2]),
      low: price(kline[3]),
      close: price(kline[4]),
      volume: Money.fromDecimalString(kline[5], symbol.value, FEED_SCALE),
    }));
  }

  async fetchTrades(symbol: AssetSymbol, limit: number): Promise<PublicTrade[] | null> {
    const pair = PAIRS[symbol.value];
    if (pair === undefined) return null;

    const payload = await this.get(`/trades?symbol=${pair}&limit=${clamp(limit, 5, 100)}`);
    if (payload === null) return null;

    const parsed = z.array(tradeSchema).safeParse(payload);
    if (!parsed.success) {
      logger.warn({ event: 'trades_unparseable', module: 'market-data', symbol: symbol.value });
      return null;
    }

    return parsed.data
      .map((trade) => ({
        id: String(trade.id),
        price: price(trade.price),
        quantity: Money.fromDecimalString(trade.qty, symbol.value, FEED_SCALE),
        at: new Date(trade.time),
        // `isBuyerMaker` true means the buyer was resting and a seller crossed the
        // spread, so the aggressive side — the one worth colouring — was a sell.
        side: trade.isBuyerMaker ? ('sell' as const) : ('buy' as const),
      }))
      .reverse(); // Newest first, which is the order a tape is read in.
  }

  /**
   * One GET, with a timeout and no throwing.
   *
   * Returns null on any failure. A trading screen that loses its book should say
   * so; it should not take the page down, and the balance and the price on it were
   * never in question.
   */
  private async get(path: string, revalidate?: number): Promise<unknown> {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
        ...(revalidate === undefined
          ? { cache: 'no-store' as const }
          : { next: { revalidate } }),
      });

      if (!response.ok) {
        logger.warn({
          event: 'book_feed_rejected',
          module: 'market-data',
          status: response.status,
          path,
        });
        return null;
      }

      return await response.json();
    } catch (error) {
      logger.warn({ event: 'book_feed_failed', module: 'market-data', path }, error);
      return null;
    }
  }
}

function price(value: string): Money {
  return Money.fromDecimalString(value, QUOTE_CURRENCY, FEED_SCALE);
}

function toLevel(level: readonly [string, string], base: string): PriceLevel {
  return {
    price: price(level[0]),
    size: Money.fromDecimalString(level[1], base, FEED_SCALE),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(Math.trunc(value), low), high);
}

export { PAIRS as BINANCE_PAIRS };
