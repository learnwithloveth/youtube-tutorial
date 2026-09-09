import { AssetSymbol } from '../../domain/asset-symbol';
import { Instrument, type MarketCategory } from '../../domain/instrument';

/**
 * The listing catalogue.
 *
 * Editorial data, held in code rather than in the database on purpose: it
 * changes when someone lists or delists an asset — a deliberate act reviewed in
 * a pull request — not at runtime. Keeping it here means the site renders its
 * full asset inventory with no database round trip at all, and a listing change
 * arrives through the same review path as any other change.
 *
 * `feedId` is the upstream's identifier for the asset. `priceScale` is the
 * precision the asset is quoted at, and it is per-asset for a reason: two
 * decimals is right for BTC and wrong for a stablecoin, where the entire story
 * is in the fourth.
 *
 * No prices live here. Prices are observations and belong to `Ticker`.
 */

interface CatalogueEntry {
  symbol: string;
  slug: string;
  name: string;
  glyph: string;
  hue: string;
  category: MarketCategory;
  blurb: string;
  feedId: string;
  priceScale: number;
  /** Indicative staking yield in basis points; null where the asset has none. */
  yieldBp: number | null;
}

const CATALOGUE: readonly CatalogueEntry[] = [
  { symbol: 'BTC', slug: 'btc', name: 'Bitcoin', glyph: '₿', hue: '#F7931A', category: 'Layer 1', blurb: 'The original settlement layer and the deepest book on Novex.', feedId: 'bitcoin', priceScale: 2, yieldBp: null },
  { symbol: 'ETH', slug: 'eth', name: 'Ethereum', glyph: 'Ξ', hue: '#8A92B2', category: 'Layer 1', blurb: 'Programmable money and the settlement rail for most of DeFi.', feedId: 'ethereum', priceScale: 2, yieldBp: 360 },
  { symbol: 'SOL', slug: 'sol', name: 'Solana', glyph: '◎', hue: '#14F195', category: 'Layer 1', blurb: 'Sub-second finality with parallel execution at 65k TPS.', feedId: 'solana', priceScale: 2, yieldBp: 710 },
  { symbol: 'USDC', slug: 'usdc', name: 'USD Coin', glyph: '$', hue: '#2775CA', category: 'Stablecoin', blurb: 'Fully reserved dollars, attested monthly by a top-4 auditor.', feedId: 'usd-coin', priceScale: 4, yieldBp: 520 },
  { symbol: 'XRP', slug: 'xrp', name: 'XRP', glyph: '✕', hue: '#3f4956', category: 'Payments', blurb: 'Cross-border settlement in three seconds for a fraction of a cent.', feedId: 'ripple', priceScale: 4, yieldBp: null },
  { symbol: 'BNB', slug: 'bnb', name: 'BNB', glyph: '◈', hue: '#F3BA2F', category: 'Layer 1', blurb: 'Gas and governance for one of the largest EVM ecosystems.', feedId: 'binancecoin', priceScale: 2, yieldBp: 240 },
  { symbol: 'ADA', slug: 'ada', name: 'Cardano', glyph: '₳', hue: '#0033AD', category: 'Layer 1', blurb: 'Peer-reviewed proof-of-stake with formal-methods tooling.', feedId: 'cardano', priceScale: 4, yieldBp: 410 },
  { symbol: 'LINK', slug: 'link', name: 'Chainlink', glyph: '⬡', hue: '#375BD2', category: 'DeFi', blurb: 'Oracle infrastructure securing north of $20B in value.', feedId: 'chainlink', priceScale: 2, yieldBp: 480 },
  { symbol: 'AVAX', slug: 'avax', name: 'Avalanche', glyph: '▲', hue: '#E84142', category: 'Layer 1', blurb: 'Subnet architecture built for app-specific throughput.', feedId: 'avalanche-2', priceScale: 2, yieldBp: 690 },
  { symbol: 'ARB', slug: 'arb', name: 'Arbitrum', glyph: '◐', hue: '#12AAFF', category: 'Layer 2', blurb: 'The largest optimistic rollup by total value secured.', feedId: 'arbitrum', priceScale: 4, yieldBp: 320 },
  { symbol: 'OP', slug: 'op', name: 'Optimism', glyph: '◑', hue: '#FF0420', category: 'Layer 2', blurb: 'The OP Stack powering a superchain of L2s.', feedId: 'optimism', priceScale: 4, yieldBp: 300 },
  { symbol: 'POL', slug: 'pol', name: 'Polygon', glyph: '⬢', hue: '#8247E5', category: 'Layer 2', blurb: 'zkEVM scaling with an aggregation layer for shared liquidity.', feedId: 'polygon-ecosystem-token', priceScale: 4, yieldBp: 440 },
  { symbol: 'UNI', slug: 'uni', name: 'Uniswap', glyph: '🦄', hue: '#FF007A', category: 'DeFi', blurb: 'The AMM that defined on-chain price discovery.', feedId: 'uniswap', priceScale: 2, yieldBp: null },
  { symbol: 'AAVE', slug: 'aave', name: 'Aave', glyph: '◍', hue: '#B6509E', category: 'DeFi', blurb: 'Non-custodial liquidity markets across eleven networks.', feedId: 'aave', priceScale: 2, yieldBp: 540 },
  { symbol: 'RENDER', slug: 'render', name: 'Render', glyph: '⧉', hue: '#FF4B14', category: 'AI', blurb: 'Distributed GPU compute for rendering and inference.', feedId: 'render-token', priceScale: 2, yieldBp: null },
  { symbol: 'TAO', slug: 'tao', name: 'Bittensor', glyph: '⨁', hue: '#00CCB0', category: 'AI', blurb: 'An incentive market for machine intelligence.', feedId: 'bittensor', priceScale: 2, yieldBp: 1240 },
  { symbol: 'DOT', slug: 'dot', name: 'Polkadot', glyph: '●', hue: '#E6007A', category: 'Layer 1', blurb: 'Shared security across a heterogeneous parachain network.', feedId: 'polkadot', priceScale: 2, yieldBp: 1120 },
  { symbol: 'ATOM', slug: 'atom', name: 'Cosmos', glyph: '⚛', hue: '#6F7390', category: 'Layer 1', blurb: 'The interchain: sovereign chains connected by IBC.', feedId: 'cosmos', priceScale: 2, yieldBp: 980 },
  { symbol: 'IMX', slug: 'imx', name: 'Immutable', glyph: '◆', hue: '#0BE5F1', category: 'Gaming', blurb: 'Zero-gas NFT minting purpose-built for game studios.', feedId: 'immutable-x', priceScale: 4, yieldBp: 210 },
  { symbol: 'ONDO', slug: 'ondo', name: 'Ondo', glyph: '◉', hue: '#3B82F6', category: 'RWA', blurb: 'Tokenised treasuries bringing TradFi yield on-chain.', feedId: 'ondo-finance', priceScale: 4, yieldBp: null },
  { symbol: 'LDO', slug: 'ldo', name: 'Lido DAO', glyph: '◇', hue: '#00A3FF', category: 'DeFi', blurb: 'Liquid staking for a third of all staked ether.', feedId: 'lido-dao', priceScale: 4, yieldBp: null },
  { symbol: 'INJ', slug: 'inj', name: 'Injective', glyph: '◭', hue: '#00D2FF', category: 'DeFi', blurb: 'A finance-native L1 with an on-chain central limit order book.', feedId: 'injective-protocol', priceScale: 2, yieldBp: 860 },
  { symbol: 'NEAR', slug: 'near', name: 'NEAR', glyph: '◎', hue: '#00EC97', category: 'AI', blurb: 'Chain abstraction and sharded execution for consumer apps.', feedId: 'near', priceScale: 2, yieldBp: 810 },
  { symbol: 'USDT', slug: 'usdt', name: 'Tether', glyph: '₮', hue: '#26A17B', category: 'Stablecoin', blurb: 'The most liquid dollar proxy in digital assets.', feedId: 'tether', priceScale: 4, yieldBp: 480 },
];

/**
 * Built once at module load. The entries are frozen data and the entities are
 * immutable, so there is nothing to rebuild per request.
 */
export const LISTED_INSTRUMENTS: readonly Instrument[] = CATALOGUE.map((entry) =>
  Instrument.create({
    symbol: AssetSymbol.parse(entry.symbol),
    slug: entry.slug,
    name: entry.name,
    glyph: entry.glyph,
    hue: entry.hue,
    category: entry.category,
    blurb: entry.blurb,
    feedId: entry.feedId,
    priceScale: entry.priceScale,
    stakingYieldBasisPoints: entry.yieldBp,
    listed: true,
  }),
);

export const INSTRUMENT_BY_SLUG: ReadonlyMap<string, Instrument> = new Map(
  LISTED_INSTRUMENTS.map((instrument) => [instrument.slug, instrument]),
);

export const INSTRUMENT_BY_SYMBOL: ReadonlyMap<string, Instrument> = new Map(
  LISTED_INSTRUMENTS.map((instrument) => [instrument.symbol.value, instrument]),
);

export const INSTRUMENT_BY_FEED_ID: ReadonlyMap<string, Instrument> = new Map(
  LISTED_INSTRUMENTS.map((instrument) => [instrument.feedId, instrument]),
);
