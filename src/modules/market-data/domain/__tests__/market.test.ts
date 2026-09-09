import { describe, expect, it } from 'vitest';

import { BasisPoints, Money, fixedClock } from '@/shared/kernel';

import { AssetSymbol } from '../asset-symbol';
import { Instrument } from '../instrument';
import { Market } from '../market';
import { MAX_TICKER_AGE_SECONDS, Ticker } from '../ticker';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const clock = fixedClock(NOW);

function instrument(symbol = 'BTC'): Instrument {
  return Instrument.create({
    symbol: AssetSymbol.parse(symbol),
    slug: symbol.toLowerCase(),
    name: 'Bitcoin',
    glyph: '₿',
    hue: '#F7931A',
    category: 'Layer 1',
    blurb: 'The original settlement layer.',
    feedId: 'bitcoin',
    priceScale: 2,
    stakingYieldBasisPoints: null,
    listed: true,
  });
}

function ticker(observedAt: Date, symbol = 'BTC'): Ticker {
  return Ticker.create({
    symbol: AssetSymbol.parse(symbol),
    price: Money.fromDecimalString('94820.44', 'USD', 2),
    change24h: BasisPoints.fromPercent(2.41),
    change7d: BasisPoints.fromPercent(8.12),
    marketCap: Money.fromDecimalString('1874000000000.00', 'USD', 2),
    volume24h: Money.fromDecimalString('41200000000.00', 'USD', 2),
    circulatingSupply: 19_780_000n,
    sparkline: null,
    observedAt,
  });
}

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe('Market.quoteStateAt', () => {
  it('reports a recent observation as live', () => {
    const market = Market.create(instrument(), ticker(secondsAgo(30)));
    const state = market.quoteStateAt(clock);

    expect(state.kind).toBe('live');
  });

  it('reports an observation past the freshness window as stale, with its age', () => {
    const market = Market.create(instrument(), ticker(secondsAgo(MAX_TICKER_AGE_SECONDS + 60)));
    const state = market.quoteStateAt(clock);

    expect(state.kind).toBe('stale');
    if (state.kind !== 'stale') throw new Error('expected a stale quote');
    expect(state.ageSeconds).toBe(MAX_TICKER_AGE_SECONDS + 60);
  });

  it('treats an observation exactly at the boundary as still live', () => {
    const market = Market.create(instrument(), ticker(secondsAgo(MAX_TICKER_AGE_SECONDS)));

    expect(market.quoteStateAt(clock).kind).toBe('live');
  });

  it('reports no ticker as unavailable rather than substituting a price', () => {
    // The whole point of the nullable ticker: a missing feed produces an empty
    // price area, never a zero and never a remembered figure presented as now.
    const market = Market.create(instrument(), null);

    expect(market.quoteStateAt(clock)).toEqual({ kind: 'unavailable' });
  });

  it('refuses to attach a ticker belonging to a different instrument', () => {
    expect(() => Market.create(instrument('BTC'), ticker(NOW, 'ETH'))).toThrow(
      /cannot be attached/,
    );
  });
});

describe('Ticker', () => {
  it('rejects a negative price', () => {
    expect(() =>
      Ticker.create({
        symbol: AssetSymbol.parse('BTC'),
        price: Money.fromDecimalString('-1.00', 'USD', 2),
        change24h: BasisPoints.zero(),
        change7d: BasisPoints.zero(),
        marketCap: null,
        volume24h: null,
        circulatingSupply: null,
        sparkline: null,
        observedAt: NOW,
      }),
    ).toThrow(RangeError);
  });

  it('rejects an invalid observation time', () => {
    expect(() =>
      Ticker.create({
        symbol: AssetSymbol.parse('BTC'),
        price: Money.fromDecimalString('1.00', 'USD', 2),
        change24h: BasisPoints.zero(),
        change7d: BasisPoints.zero(),
        marketCap: null,
        volume24h: null,
        circulatingSupply: null,
        sparkline: null,
        observedAt: new Date('not a date'),
      }),
    ).toThrow(TypeError);
  });

  it('derives direction from the 24-hour move', () => {
    expect(ticker(NOW).direction).toBe('up');
  });
});

describe('AssetSymbol', () => {
  it('normalises case so lookups do not miss', () => {
    expect(AssetSymbol.parse('btc').value).toBe('BTC');
    expect(AssetSymbol.parse(' eth ').equals(AssetSymbol.parse('ETH'))).toBe(true);
  });

  it('returns null for user input that is not a symbol, instead of throwing', () => {
    expect(AssetSymbol.tryParse('../../etc/passwd')).toBeNull();
    expect(AssetSymbol.tryParse('')).toBeNull();
  });
});

describe('Instrument', () => {
  it('rejects a slug that is not URL-safe kebab-case', () => {
    expect(() =>
      Instrument.create({ ...instrumentProps(), slug: 'Bitcoin Cash' }),
    ).toThrow(TypeError);
  });

  it('reports whether the asset offers a staking yield', () => {
    expect(Instrument.create({ ...instrumentProps(), stakingYieldBasisPoints: 710 }).offersYield).toBe(true);
    expect(Instrument.create({ ...instrumentProps(), stakingYieldBasisPoints: 0 }).offersYield).toBe(false);
    expect(Instrument.create({ ...instrumentProps(), stakingYieldBasisPoints: null }).offersYield).toBe(false);
  });

  function instrumentProps() {
    return {
      symbol: AssetSymbol.parse('SOL'),
      slug: 'sol',
      name: 'Solana',
      glyph: '◎',
      hue: '#14F195',
      category: 'Layer 1' as const,
      blurb: 'Sub-second finality.',
      feedId: 'solana',
      priceScale: 2,
      stakingYieldBasisPoints: 710,
      listed: true,
    };
  }
});
