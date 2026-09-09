import { AssetSymbol } from './asset-symbol';

/**
 * Instrument — a listed asset, as *we* describe it.
 *
 * The split between this and `Ticker` is the central modelling decision in this
 * context, and it follows the source of truth. An instrument's name, category,
 * glyph, brand hue and blurb are editorial: we choose them, they change when a
 * writer changes them, and they are identical whether or not a price feed is
 * reachable. A ticker's price and volume are observations: we do not choose
 * them, they change every few seconds, and they are unavailable when the feed
 * is down.
 *
 * Keeping them in one object would mean either refetching editorial copy on
 * every price tick or being unable to render the asset at all when the feed
 * fails. Separated, a market page still renders — name, description, category —
 * with the price area honestly empty.
 */

export type MarketCategory =
  | 'Layer 1'
  | 'Layer 2'
  | 'DeFi'
  | 'Stablecoin'
  | 'AI'
  | 'Payments'
  | 'Gaming'
  | 'RWA';

export const MARKET_CATEGORIES: readonly MarketCategory[] = [
  'Layer 1',
  'Layer 2',
  'DeFi',
  'Stablecoin',
  'AI',
  'Payments',
  'Gaming',
  'RWA',
];

export interface InstrumentProps {
  readonly symbol: AssetSymbol;
  /** URL segment. Stable and lowercase — changing it breaks links. */
  readonly slug: string;
  readonly name: string;
  /** Single-character mark rendered in the asset avatar. */
  readonly glyph: string;
  /** Brand hue, used for the avatar, sparkline stroke and hover halo. */
  readonly hue: string;
  readonly category: MarketCategory;
  readonly blurb: string;
  /** Identifier used by the upstream price feed to refer to this asset. */
  readonly feedId: string;
  /** Decimal places this asset's price is quoted at. */
  readonly priceScale: number;
  /** Indicative staking yield in basis points, where the asset offers one. */
  readonly stakingYieldBasisPoints: number | null;
  readonly listed: boolean;
}

export class Instrument {
  readonly symbol: AssetSymbol;
  readonly slug: string;
  readonly name: string;
  readonly glyph: string;
  readonly hue: string;
  readonly category: MarketCategory;
  readonly blurb: string;
  readonly feedId: string;
  readonly priceScale: number;
  readonly stakingYieldBasisPoints: number | null;
  readonly listed: boolean;

  private constructor(props: InstrumentProps) {
    this.symbol = props.symbol;
    this.slug = props.slug;
    this.name = props.name;
    this.glyph = props.glyph;
    this.hue = props.hue;
    this.category = props.category;
    this.blurb = props.blurb;
    this.feedId = props.feedId;
    this.priceScale = props.priceScale;
    this.stakingYieldBasisPoints = props.stakingYieldBasisPoints;
    this.listed = props.listed;
  }

  static create(props: InstrumentProps): Instrument {
    if (!/^[a-z0-9-]{2,32}$/.test(props.slug)) {
      throw new TypeError(`Instrument slug must be lowercase kebab-case: "${props.slug}"`);
    }
    if (props.name.trim().length === 0) {
      throw new TypeError(`Instrument ${props.symbol.value} requires a name.`);
    }
    if (!Number.isInteger(props.priceScale) || props.priceScale < 0 || props.priceScale > 18) {
      throw new RangeError(
        `Instrument ${props.symbol.value} has an out-of-range price scale: ${props.priceScale}`,
      );
    }
    return new Instrument(props);
  }

  /** Whether this asset can be staked for a yield on the platform. */
  get offersYield(): boolean {
    return this.stakingYieldBasisPoints !== null && this.stakingYieldBasisPoints > 0;
  }

  equals(other: Instrument): boolean {
    return this.symbol.equals(other.symbol);
  }
}

export { AssetSymbol };
