import { describe, expect, it } from 'vitest';

import { BasisPoints, Money, err, fixedClock, ok, type Result } from '@/shared/kernel';

import { AssetSymbol } from '../../domain/asset-symbol';
import type { MarketDataError } from '../../domain/errors';
import { Instrument, type MarketCategory } from '../../domain/instrument';
import { MAX_TICKER_AGE_SECONDS, Ticker, type TickerSnapshot } from '../../domain/ticker';
import type { InstrumentRepository, MarketDataFeed, TickerRepository } from '../ports';
import { getMarketBySlug } from '../queries/get-market';
import { listMarkets } from '../queries/list-markets';
import { refreshTickers } from '../use-cases/refresh-tickers';

/**
 * These exercise the real application logic with fake adapters. No database, no
 * network — which is the payoff of declaring ports in the application layer.
 */

const NOW = new Date('2026-09-09T12:00:00.000Z');
const clock = fixedClock(NOW);

function makeInstrument(symbol: string, category: MarketCategory = 'Layer 1'): Instrument {
  return Instrument.create({
    symbol: AssetSymbol.parse(symbol),
    slug: symbol.toLowerCase(),
    name: symbol,
    glyph: '◆',
    hue: '#000000',
    category,
    blurb: 'Test asset.',
    feedId: symbol.toLowerCase(),
    priceScale: 2,
    stakingYieldBasisPoints: 710,
    listed: true,
  });
}

function makeSnapshot(symbol: string, price: string, observedAt = NOW): TickerSnapshot {
  return {
    symbol: AssetSymbol.parse(symbol),
    price: Money.fromDecimalString(price, 'USD', 2),
    change24h: BasisPoints.fromPercent(2.41),
    change7d: BasisPoints.fromPercent(8.12),
    marketCap: null,
    volume24h: null,
    circulatingSupply: null,
    sparkline: null,
    observedAt,
  };
}

class FakeInstruments implements InstrumentRepository {
  constructor(private readonly items: Instrument[]) {}
  async listListed() {
    return this.items;
  }
  async findBySlug(slug: string) {
    return this.items.find((item) => item.slug === slug) ?? null;
  }
}

class FakeTickers implements TickerRepository {
  readonly store = new Map<string, Ticker>();
  constructor(snapshots: TickerSnapshot[] = []) {
    for (const snapshot of snapshots) this.store.set(snapshot.symbol.value, Ticker.create(snapshot));
  }
  async latestFor(symbols: readonly AssetSymbol[]) {
    const result = new Map<string, Ticker>();
    for (const symbol of symbols) {
      const found = this.store.get(symbol.value);
      if (found) result.set(symbol.value, found);
    }
    return result;
  }
  async record(snapshots: readonly TickerSnapshot[]) {
    for (const snapshot of snapshots) this.store.set(snapshot.symbol.value, Ticker.create(snapshot));
  }
}

describe('listMarkets', () => {
  const instruments = [makeInstrument('BTC'), makeInstrument('SOL'), makeInstrument('UNI', 'DeFi')];

  it('returns a row for every listed instrument, priced or not', () => {
    // An asset with no observation still appears — with its name, category and
    // blurb — because the instrument is what makes it listed, not the price.
    return listMarkets({
      instruments: new FakeInstruments(instruments),
      tickers: new FakeTickers([makeSnapshot('BTC', '94820.44')]),
      clock,
    }).then((rows) => {
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.symbol)).toEqual(['BTC', 'SOL', 'UNI']);
      expect(rows[0]?.quote.state).toBe('live');
      expect(rows[1]?.quote.state).toBe('unavailable');
    });
  });

  it('carries the price as an exact decimal string, not a number', async () => {
    const [row] = await listMarkets({
      instruments: new FakeInstruments([makeInstrument('BTC')]),
      tickers: new FakeTickers([makeSnapshot('BTC', '94820.44')]),
      clock,
    });

    expect(row?.quote).toMatchObject({ price: '94820.44', currency: 'USD' });
  });

  it('labels an observation past the freshness window as stale', async () => {
    const stale = makeSnapshot(
      'BTC',
      '94820.44',
      new Date(NOW.getTime() - (MAX_TICKER_AGE_SECONDS + 120) * 1000),
    );

    const [row] = await listMarkets({
      instruments: new FakeInstruments([makeInstrument('BTC')]),
      tickers: new FakeTickers([stale]),
      clock,
    });

    if (!row) throw new Error('expected a row');
    expect(row.quote.state).toBe('stale');
    if (row.quote.state === 'unavailable') throw new Error('expected a quote');
    expect(row.quote.ageSeconds).toBe(MAX_TICKER_AGE_SECONDS + 120);
  });

  it('filters by category', async () => {
    const rows = await listMarkets(
      { instruments: new FakeInstruments(instruments), tickers: new FakeTickers(), clock },
      { category: 'DeFi' },
    );

    expect(rows.map((row) => row.symbol)).toEqual(['UNI']);
  });

  it('applies the limit after filtering', async () => {
    const rows = await listMarkets(
      { instruments: new FakeInstruments(instruments), tickers: new FakeTickers(), clock },
      { limit: 2 },
    );

    expect(rows).toHaveLength(2);
  });

  it('converts a staking yield in basis points to a display percentage', async () => {
    const [row] = await listMarkets({
      instruments: new FakeInstruments([makeInstrument('SOL')]),
      tickers: new FakeTickers(),
      clock,
    });

    expect(row?.yieldPercent).toBe(7.1);
  });
});

describe('getMarketBySlug', () => {
  it('finds a listed asset case-insensitively', async () => {
    const result = await getMarketBySlug(
      {
        instruments: new FakeInstruments([makeInstrument('BTC')]),
        tickers: new FakeTickers([makeSnapshot('BTC', '94820.44')]),
        clock,
      },
      'BTC',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('BTC');
  });

  it('reports why there is nothing to show, rather than returning null', async () => {
    const result = await getMarketBySlug(
      { instruments: new FakeInstruments([]), tickers: new FakeTickers(), clock },
      'nope',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'instrument-not-found', slug: 'nope' });
  });
});

describe('refreshTickers', () => {
  class StubFeed implements MarketDataFeed {
    constructor(private readonly response: Result<TickerSnapshot[], MarketDataError>) {}
    async fetchQuotes() {
      return this.response;
    }
  }

  it('records every quote the feed returned', async () => {
    const tickers = new FakeTickers();
    const result = await refreshTickers({
      instruments: new FakeInstruments([makeInstrument('BTC'), makeInstrument('SOL')]),
      tickers,
      feed: new StubFeed(ok([makeSnapshot('BTC', '94820.44'), makeSnapshot('SOL', '238.16')])),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ instrumentsRequested: 2, quotesRecorded: 2 });
    expect(tickers.store.size).toBe(2);
  });

  it('returns the feed failure instead of throwing, leaving stored quotes intact', async () => {
    const tickers = new FakeTickers([makeSnapshot('BTC', '94820.44')]);
    const result = await refreshTickers({
      instruments: new FakeInstruments([makeInstrument('BTC')]),
      tickers,
      feed: new StubFeed(err({ kind: 'feed-unavailable', reason: 'upstream responded 503' })),
    });

    expect(result.ok).toBe(false);
    // The previous observation survives — the site degrades to "stale", not to
    // "empty", and certainly not to a crash.
    expect(tickers.store.get('BTC')?.price.toDecimalString()).toBe('94820.44');
  });

  it('does nothing when there is nothing listed', async () => {
    const result = await refreshTickers({
      instruments: new FakeInstruments([]),
      tickers: new FakeTickers(),
      feed: new StubFeed(err({ kind: 'feed-unavailable', reason: 'should not be called' })),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quotesRecorded).toBe(0);
  });
});
