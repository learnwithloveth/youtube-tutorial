import type { Clock } from '@/shared/kernel';

import type { Instrument } from './instrument';
import { MAX_TICKER_AGE_SECONDS, type Ticker } from './ticker';

/**
 * Market — an instrument together with what we currently know about its price.
 *
 * The ticker is deliberately nullable, and `quoteState` is the only sanctioned
 * way to ask what may be rendered. This is the point in the model where the
 * product rule lives:
 *
 *   A price is shown as live only when it was actually observed recently.
 *   Otherwise the page says so, or shows nothing. It never fills the gap.
 *
 * Making the absent case a variant of a union rather than a `price ?? 0` means
 * a caller cannot forget it — the type will not narrow until every state is
 * handled.
 */

export type QuoteState =
  | { readonly kind: 'live'; readonly ticker: Ticker }
  | { readonly kind: 'stale'; readonly ticker: Ticker; readonly ageSeconds: number }
  | { readonly kind: 'unavailable' };

export class Market {
  private constructor(
    readonly instrument: Instrument,
    readonly ticker: Ticker | null,
  ) {}

  static create(instrument: Instrument, ticker: Ticker | null): Market {
    if (ticker && !ticker.symbol.equals(instrument.symbol)) {
      throw new TypeError(
        `Ticker for ${ticker.symbol.value} cannot be attached to instrument ${instrument.symbol.value}.`,
      );
    }
    return new Market(instrument, ticker);
  }

  quoteStateAt(clock: Clock, maxAgeSeconds: number = MAX_TICKER_AGE_SECONDS): QuoteState {
    if (!this.ticker) return { kind: 'unavailable' };
    if (this.ticker.isStaleAt(clock, maxAgeSeconds)) {
      return {
        kind: 'stale',
        ticker: this.ticker,
        ageSeconds: this.ticker.ageInSecondsAt(clock),
      };
    }
    return { kind: 'live', ticker: this.ticker };
  }
}
