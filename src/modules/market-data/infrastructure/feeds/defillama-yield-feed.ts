import 'server-only';

import { z } from 'zod';

import { logger } from '@/platform/observability/logger';
import { BasisPoints, type Clock } from '@/shared/kernel';

import type { AssetSymbol } from '../../domain/asset-symbol';
import { StakingYield } from '../../domain/staking-yield';
import type { YieldFeed } from '../../application/ports';

/**
 * Observed staking yields, from DefiLlama's public yields index.
 *
 * Free, no key, and it aggregates the protocols that actually hold the stake
 * rather than publishing a rate of its own — which is what makes it citable: every
 * number here names the pool it came from.
 *
 * ── The response is large, and that shapes the caching ─────────────────────────
 * `/pools` is the only list endpoint and it returns every pool DefiLlama tracks —
 * roughly sixteen thousand, several megabytes. There is no server-side filter.
 *
 * Yields move on a daily timescale, so this is cached for an hour and filtered
 * here. That turns a multi-megabyte parse into one request per hour per instance
 * rather than one per page view, which is the difference between "a useful free
 * API" and "an outage we caused ourselves".
 *
 * ── Picking one pool per asset is a judgement, and it is made explicitly ───────
 * Several pools quote a rate for the same asset and they are not comparable: a
 * lending market, a liquid-staking token and an incentivised farm carry different
 * risks for the same number. The filter below keeps only single-sided, no-
 * impermanent-loss pools above a size floor, then takes the largest — which is the
 * closest available proxy for "the one a reasonable person would mean". It is a
 * choice, not a fact, and it is made here rather than buried in a component.
 */

const URL = 'https://yields.llama.fi/pools';
const REQUEST_TIMEOUT_MS = 12_000;
/** Yields move daily. An hour is fresh enough and spares a multi-megabyte parse. */
const CACHE_SECONDS = 3_600;

/**
 * Smallest pool worth quoting, in USD.
 *
 * A rate on a pool holding fifty thousand dollars is arithmetic, not a market: it
 * moves on one deposit and nobody could enter at it in size.
 */
const MIN_TVL_USD = 50_000_000;

/**
 * Pool tickers that represent staking a given asset.
 *
 * Needed because the staked form has its own ticker — ether staked through Lido is
 * `STETH`, not `ETH` — so a naive symbol match finds lending markets and misses
 * the actual staking product entirely.
 */
const POOL_SYMBOLS: Readonly<Record<string, readonly string[]>> = {
  ETH: ['STETH', 'WSTETH', 'RETH', 'ETH'],
  SOL: ['JITOSOL', 'MSOL', 'BSOL', 'SOL'],
  BTC: ['WBTC', 'BTC', 'CBBTC'],
  USDC: ['USDC'],
  USDT: ['USDT'],
  MATIC: ['STMATIC', 'MATIC'],
  ATOM: ['STATOM', 'ATOM'],
  DOT: ['DOT'],
  AVAX: ['SAVAX', 'AVAX'],
  NEAR: ['NEAR'],
  ADA: ['ADA'],
};

const poolSchema = z.object({
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: z.number().nullable(),
  /** A percentage: `2.235` means 2.235%. */
  apy: z.number().nullable(),
  apyBase: z.number().nullable().optional(),
  ilRisk: z.string().nullable().optional(),
  exposure: z.string().nullable().optional(),
});

const responseSchema = z.object({
  status: z.string(),
  data: z.array(z.unknown()),
});

export class DefiLlamaYieldFeed implements YieldFeed {
  constructor(private readonly clock: Clock) {}

  async fetchYields(symbols: readonly AssetSymbol[]): Promise<StakingYield[] | null> {
    if (symbols.length === 0) return [];

    let payload: unknown;
    try {
      const response = await fetch(URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
        next: { revalidate: CACHE_SECONDS },
      });

      if (!response.ok) {
        logger.warn({
          event: 'yield_feed_rejected',
          module: 'market-data',
          status: response.status,
        });
        return null;
      }
      payload = await response.json();
    } catch (error) {
      logger.warn({ event: 'yield_feed_failed', module: 'market-data' }, error);
      return null;
    }

    const envelope = responseSchema.safeParse(payload);
    if (!envelope.success || envelope.data.status !== 'success') {
      logger.warn({ event: 'yield_feed_unparseable', module: 'market-data' });
      return null;
    }

    const observedAt = this.clock.now();
    const found: StakingYield[] = [];

    for (const symbol of symbols) {
      const best = this.bestPoolFor(symbol.value, envelope.data.data);
      if (best === null) continue;

      found.push(
        StakingYield.create({
          symbol: symbol.value,
          protocol: best.project,
          chain: best.chain,
          // `fromPercent` rounds to whole basis points, which is the precision a
          // yield is meaningfully quoted at — 2.235% is 223 bp, and the fourth
          // decimal of an APY is noise dressed as information.
          apy: BasisPoints.fromPercent(best.apy ?? 0),
          baseApy:
            best.apyBase === null || best.apyBase === undefined
              ? null
              : BasisPoints.fromPercent(best.apyBase),
          tvlUsd: best.tvlUsd ?? 0,
          poolSymbol: best.symbol.toUpperCase(),
          observedAt,
        }),
      );
    }

    return found;
  }

  /**
   * The largest credible pool for one asset.
   *
   * Single-sided with no impermanent loss, because a two-sided LP position is a
   * different product with a different risk and quoting its APY next to a staking
   * rate invites a comparison that does not hold.
   */
  private bestPoolFor(symbol: string, pools: readonly unknown[]) {
    const wanted = POOL_SYMBOLS[symbol];
    if (wanted === undefined) return null;

    let best: z.infer<typeof poolSchema> | null = null;

    for (const raw of pools) {
      const parsed = poolSchema.safeParse(raw);
      if (!parsed.success) continue;

      const pool = parsed.data;
      if (!wanted.includes(pool.symbol.toUpperCase())) continue;
      if (pool.exposure !== 'single' || pool.ilRisk !== 'no') continue;
      if ((pool.tvlUsd ?? 0) < MIN_TVL_USD) continue;
      if (pool.apy === null || pool.apy < 0) continue;

      if (best === null || (pool.tvlUsd ?? 0) > (best.tvlUsd ?? 0)) best = pool;
    }

    return best;
  }
}
