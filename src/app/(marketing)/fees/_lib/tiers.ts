/**
 * The published fee schedule.
 *
 * Editorial data with no runtime source, kept beside the page that renders it.
 * `BASE_TIER` is named separately so the fallback in the tier lookup is a value
 * rather than an index the compiler cannot prove is present.
 */

export interface Tier {
  name: string;
  volume: number;
  maker: number;
  taker: number;
  perks: string[];
}

/** Named separately so the base tier is a value, not an index lookup. */
export const BASE_TIER: Tier = { name: 'Base', volume: 0, maker: 0.02, taker: 0.1, perks: ['30 days commission-free', 'Free local-rail deposits'] };

export const TIERS: Tier[] = [
  BASE_TIER,
  { name: 'Silver', volume: 50_000, maker: 0.015, taker: 0.08, perks: ['Priority support queue', 'Higher withdrawal limits'] },
  { name: 'Gold', volume: 500_000, maker: 0.008, taker: 0.05, perks: ['Dedicated account manager', 'API rate limit ×4'] },
  { name: 'Platinum', volume: 5_000_000, maker: 0.0, taker: 0.04, perks: ['Zero maker fees', 'Colocated API endpoint'] },
  { name: 'Prime', volume: 50_000_000, maker: -0.005, taker: 0.03, perks: ['Maker rebate paid daily', 'FIX 4.4 session', 'OTC desk access'] },
];
