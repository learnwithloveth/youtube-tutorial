import type { Clock, PriceDirection } from '@/shared/kernel';

import type { Instrument, MarketCategory } from '../domain/instrument';
import type { Market } from '../domain/market';

/**
 * DTOs — the shapes that leave this module.
 *
 * Two constraints shape them. First, anything a Server Component passes to a
 * Client Component has to survive serialisation, and `Money`, `BasisPoints` and
 * `AssetSymbol` are classes with methods, so they cannot cross that boundary
 * intact. Second, exporting domain objects would let a page reach past the
 * module's contract and depend on internals it should not know about.
 *
 * Amounts therefore travel as exact decimal *strings*, not numbers. The string
 * is the lossless form; converting to a number happens once, in a formatter, at
 * the moment of display. A DTO that carried `price: number` would have thrown
 * away the precision the domain went to some trouble to keep.
 */

export interface MarketDto {
  readonly symbol: string;
  readonly slug: string;
  readonly name: string;
  readonly glyph: string;
  readonly hue: string;
  readonly category: MarketCategory;
  readonly blurb: string;
  /** Indicative staking yield as a percentage, or null where none is offered. */
  readonly yieldPercent: number | null;
  readonly quote: QuoteDto;
}

export type QuoteDto =
  | {
      readonly state: 'live' | 'stale';
      /** Exact price as a decimal string, e.g. "94820.44". */
      readonly price: string;
      readonly currency: string;
      readonly change24hPercent: number;
      readonly change7dPercent: number;
      readonly direction: PriceDirection;
      readonly marketCap: string | null;
      readonly volume24h: string | null;
      readonly circulatingSupply: string | null;
      /** 7-day shape normalised to 0..1, or null when no history exists. */
      readonly sparkline: readonly number[] | null;
      /** ISO-8601 instant the price was observed. */
      readonly observedAt: string;
      /** Seconds since observation, present only when the quote is stale. */
      readonly ageSeconds: number | null;
    }
  | { readonly state: 'unavailable' };

export function toMarketDto(market: Market, clock: Clock): MarketDto {
  const { instrument } = market;
  const state = market.quoteStateAt(clock);

  return {
    symbol: instrument.symbol.value,
    slug: instrument.slug,
    name: instrument.name,
    glyph: instrument.glyph,
    hue: instrument.hue,
    category: instrument.category,
    blurb: instrument.blurb,
    yieldPercent:
      instrument.stakingYieldBasisPoints === null
        ? null
        : instrument.stakingYieldBasisPoints / 100,
    quote:
      state.kind === 'unavailable'
        ? { state: 'unavailable' }
        : {
            state: state.kind,
            price: state.ticker.price.toDecimalString(),
            currency: state.ticker.price.currency,
            change24hPercent: state.ticker.change24h.toPercentForDisplay(),
            change7dPercent: state.ticker.change7d.toPercentForDisplay(),
            direction: state.ticker.direction,
            marketCap: state.ticker.marketCap?.toDecimalString() ?? null,
            volume24h: state.ticker.volume24h?.toDecimalString() ?? null,
            circulatingSupply: state.ticker.circulatingSupply?.toString() ?? null,
            sparkline: state.ticker.sparkline,
            observedAt: state.ticker.observedAt.toISOString(),
            ageSeconds: state.kind === 'stale' ? state.ageSeconds : null,
          },
  };
}

/** The instrument alone, for surfaces that never show a price. */
export interface InstrumentDto {
  readonly symbol: string;
  readonly slug: string;
  readonly name: string;
  readonly glyph: string;
  readonly hue: string;
  readonly category: MarketCategory;
  readonly blurb: string;
  readonly yieldPercent: number | null;
}

export function toInstrumentDto(instrument: Instrument): InstrumentDto {
  return {
    symbol: instrument.symbol.value,
    slug: instrument.slug,
    name: instrument.name,
    glyph: instrument.glyph,
    hue: instrument.hue,
    category: instrument.category,
    blurb: instrument.blurb,
    yieldPercent:
      instrument.stakingYieldBasisPoints === null
        ? null
        : instrument.stakingYieldBasisPoints / 100,
  };
}
