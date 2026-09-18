import { ASSET_BY_ID, ASSETS } from '../../_console/data/assets';
import { hashSeed, pick, seededRandom } from '../../_console/data/simulation';
import { DAY, NOW, buildSeries } from '../../_console/data/series';
import { BRAND } from '@/modules/content';

// Re-exported so the dashboard pages keep importing them from one place.
export { NOW, buildSeries };
import type {
  ApiKey, BookLevel, Candle, Fill, Holding, Order, RecurringPlan,
  Referral, Session, StakePosition, Transaction, TxKind, TxStatus,
} from './types';

/**
 * The signed-in account.
 *
 * Every figure below is derived, not transcribed: totals come from the holdings,
 * P&L from cost basis against the live catalogue price, and all time series from
 * the same seeded PRNG the market ticker uses. Nothing can drift out of
 * agreement with anything else on screen, and two runs render identically.
 */


export const ACCOUNT = {
  name: 'Amara Okonkwo',
  handle: '@amara',
  email: 'amara@meridian.capital',
  initials: 'AO',
  hue: '#10BD85',
  tier: 'Gold',
  memberSince: '2021-03-14',
  verified: true,
  twoFactor: 'Passkey + hardware key',
  baseCurrency: 'USD',
} as const;

const HOLDING_SPEC: { id: string; quantity: number; costBasis: number; staked: number }[] = [
  { id: 'btc', quantity: 1.2048, costBasis: 61_240, staked: 0 },
  { id: 'eth', quantity: 8.52, costBasis: 2_910.4, staked: 4.0 },
  { id: 'sol', quantity: 62.4, costBasis: 141.8, staked: 40.0 },
  { id: 'usdc', quantity: 9_500, costBasis: 1, staked: 9_500 },
  { id: 'tao', quantity: 11.8, costBasis: 388.5, staked: 8.0 },
  { id: 'link', quantity: 84.6, costBasis: 18.94, staked: 0 },
  { id: 'arb', quantity: 618, costBasis: 1.42, staked: 0 },
  { id: 'ondo', quantity: 940, costBasis: 1.12, staked: 0 },
];

export const HOLDINGS: readonly Holding[] = HOLDING_SPEC.flatMap((spec) => {
  const asset = ASSET_BY_ID.get(spec.id);
  return asset ? [{ asset, quantity: spec.quantity, costBasis: spec.costBasis, staked: spec.staked }] : [];
});

/** Portfolio value at catalogue prices — the anchor every series ends on. */
export const PORTFOLIO_VALUE = HOLDINGS.reduce((sum, h) => sum + h.quantity * h.asset.price, 0);
export const PORTFOLIO_INVESTED = HOLDINGS.reduce((sum, h) => sum + h.quantity * h.costBasis, 0);
export const PORTFOLIO_PNL = PORTFOLIO_VALUE - PORTFOLIO_INVESTED;
export const AVAILABLE_CASH = 24_180.55;

export const PORTFOLIO_SERIES = {
  '24h': buildSeries('pf-24h', 24, PORTFOLIO_VALUE, 0.021),
  '7d': buildSeries('pf-7d', 7, PORTFOLIO_VALUE, 0.048),
  '30d': buildSeries('pf-30d', 30, PORTFOLIO_VALUE, 0.132),
  '90d': buildSeries('pf-90d', 90, PORTFOLIO_VALUE, 0.286),
  '1y': buildSeries('pf-1y', 365, PORTFOLIO_VALUE, 0.742),
} as const;

export type RangeKey = keyof typeof PORTFOLIO_SERIES;
export const RANGE_KEYS: RangeKey[] = ['24h', '7d', '30d', '90d', '1y'];

/** Realised profit and loss per month — a genuinely diverging measure. */
export const MONTHLY_PNL: { month: string; value: number }[] = (() => {
  const rand = seededRandom(hashSeed('monthly-pnl'));
  const labels = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  return labels.map((month, i) => {
    const bias = i < 3 ? -0.3 : i > 8 ? 0.55 : 0.2;
    return { month, value: Math.round(((rand() - 0.5 + bias) * 18_400) / 10) * 10 };
  });
})();

/** Trades per day for the activity heatmap — 18 weeks, Monday-first. */
export const ACTIVITY: { t: number; count: number }[] = (() => {
  const rand = seededRandom(hashSeed('activity'));
  const total = 18 * 7;
  return Array.from({ length: total }, (_, i) => {
    const t = NOW - (total - 1 - i) * DAY;
    const weekday = new Date(t).getUTCDay();
    const weekendDamping = weekday === 0 || weekday === 6 ? 0.35 : 1;
    const roll = rand();
    const count = roll < 0.22 ? 0 : Math.round(roll * 14 * weekendDamping);
    return { t, count };
  });
})();

const TX_KINDS: TxKind[] = ['buy', 'sell', 'convert', 'deposit', 'withdrawal', 'reward', 'stake', 'unstake'];
const NETWORKS = ['Bitcoin', 'Ethereum', 'Solana', 'Base', 'Arbitrum', 'SEPA Instant', 'NIP'];

export const TRANSACTIONS: readonly Transaction[] = (() => {
  const rand = seededRandom(hashSeed('transactions'));
  return Array.from({ length: 42 }, (_, i) => {
    const kind = pick(TX_KINDS, rand);
    const asset = pick(ASSETS.slice(0, 12), rand);
    const value = Math.round((80 + rand() * 14_000) * 100) / 100;
    const status: TxStatus = rand() > 0.94 ? 'pending' : rand() > 0.985 ? 'failed' : 'completed';
    return {
      id: `tx_${(1_000_000 + i * 7919).toString(36)}`,
      kind,
      symbol: kind === 'deposit' || kind === 'withdrawal' ? (rand() > 0.5 ? 'USD' : asset.symbol) : asset.symbol,
      quantity: value / asset.price,
      value,
      fee: Math.round(value * 0.001 * 100) / 100,
      status,
      timestamp: new Date(NOW - i * (DAY / 2.4) - rand() * DAY).toISOString(),
      reference: `0x${Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0')}…${Math.floor(rand() * 0xffff).toString(16).padStart(4, '0')}`,
      network: pick(NETWORKS, rand),
    } satisfies Transaction;
  });
})();

export const OPEN_ORDERS: readonly Order[] = [
  { id: 'ord_8fa21', market: 'BTC-USD', side: 'buy', type: 'limit', price: 91_400, size: 0.35, filled: 0, placedAt: new Date(NOW - 3 * 3_600_000).toISOString() },
  { id: 'ord_8fa22', market: 'ETH-USD', side: 'sell', type: 'limit', price: 4_480, size: 2.5, filled: 0.8, placedAt: new Date(NOW - 9 * 3_600_000).toISOString() },
  { id: 'ord_8fa23', market: 'SOL-USD', side: 'buy', type: 'stop-limit', price: 214.5, size: 24, filled: 0, placedAt: new Date(NOW - 26 * 3_600_000).toISOString() },
  { id: 'ord_8fa24', market: 'TAO-USD', side: 'buy', type: 'limit', price: 560, size: 3, filled: 0, placedAt: new Date(NOW - 48 * 3_600_000).toISOString() },
];

export const RECENT_FILLS: readonly Fill[] = (() => {
  const rand = seededRandom(hashSeed('fills'));
  const markets = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'LINK-USD', 'ARB-USD'];
  return Array.from({ length: 14 }, (_, i) => {
    const market = pick(markets, rand);
    const base = ASSET_BY_ID.get((market.split('-')[0] ?? '').toLowerCase())?.price ?? 100;
    const price = base * (0.996 + rand() * 0.008);
    const size = Math.round((base > 10_000 ? rand() * 0.4 : rand() * 26) * 10_000) / 10_000;
    return {
      id: `fill_${i}`,
      market,
      side: rand() > 0.45 ? 'buy' : 'sell',
      price,
      size,
      fee: Math.round(price * size * 0.0008 * 100) / 100,
      filledAt: new Date(NOW - i * 1_740_000 - rand() * 600_000).toISOString(),
      role: rand() > 0.5 ? 'maker' : 'taker',
    } satisfies Fill;
  });
})();

/** OHLC candles that close on the catalogue price, so chart and ticker agree. */
export function buildCandles(symbol: string, count = 90): Candle[] {
  const asset = ASSET_BY_ID.get(symbol.toLowerCase());
  const close = asset?.price ?? 100;
  const rand = seededRandom(hashSeed(`candles-${symbol}`));
  const out: Candle[] = [];
  let c = close;
  for (let i = 0; i < count; i += 1) {
    const drift = 0.0035;
    const vol = 0.021;
    const o = c / (1 + drift + (rand() - 0.5) * vol);
    const hi = Math.max(o, c) * (1 + rand() * 0.011);
    const lo = Math.min(o, c) * (1 - rand() * 0.011);
    out.push({ t: NOW - i * DAY, o, h: hi, l: lo, c, v: (0.6 + rand()) * (asset?.volume24h ?? 1e9) * 0.4 });
    c = o;
  }
  return out.reverse();
}

/** A synthetic book: sizes decay away from the touch, totals are cumulative. */
export function buildBook(mid: number, levels = 14): { bids: BookLevel[]; asks: BookLevel[]; spread: number } {
  const rand = seededRandom(hashSeed(`book-${Math.round(mid)}`));
  const tick = mid > 10_000 ? 5 : mid > 100 ? 0.05 : 0.001;
  const make = (dir: -1 | 1): BookLevel[] => {
    let total = 0;
    return Array.from({ length: levels }, (_, i) => {
      const price = mid + dir * tick * (i + 1);
      const size = Math.round((0.35 + rand() * 2.4) * (1 + i * 0.16) * 1_000) / 1_000;
      total += size;
      return { price, size, total };
    });
  };
  return { bids: make(-1), asks: make(1), spread: tick * 2 };
}

export const STAKE_POSITIONS: readonly StakePosition[] = HOLDINGS.filter((h) => h.staked > 0).map((h) => ({
  symbol: h.asset.symbol,
  name: h.asset.name,
  hue: h.asset.hue,
  glyph: h.asset.glyph,
  staked: h.staked,
  value: h.staked * h.asset.price,
  apy: h.asset.apy ?? 0,
  earnedToDate: h.staked * h.asset.price * ((h.asset.apy ?? 0) / 100) * 0.42,
  nextPayout: 'In 6 hours',
  unbonding: (h.asset.apy ?? 0) > 6 ? '2–28 days' : 'Instant',
}));

export const STAKING_VALUE = STAKE_POSITIONS.reduce((s, p) => s + p.value, 0);
export const STAKING_ANNUAL = STAKE_POSITIONS.reduce((s, p) => s + (p.value * p.apy) / 100, 0);
export const REWARDS_SERIES = buildSeries('rewards', 90, STAKE_POSITIONS.reduce((s, p) => s + p.earnedToDate, 0), 1.9);

export const RECURRING_PLANS: readonly RecurringPlan[] = [
  { id: 'rp_1', symbol: 'BTC', amount: 250, cadence: 'Weekly', nextRun: 'Friday, 06:00 UTC', invested: 18_420, averageCost: 61_204, active: true },
  { id: 'rp_2', symbol: 'ETH', amount: 500, cadence: 'Monthly', nextRun: '1 Oct, 06:00 UTC', invested: 12_000, averageCost: 2_910, active: true },
  { id: 'rp_3', symbol: 'SOL', amount: 120, cadence: 'Every 2 weeks', nextRun: '12 Sep, 06:00 UTC', invested: 4_320, averageCost: 141, active: true },
  { id: 'rp_4', symbol: 'USDC', amount: 1_000, cadence: 'Monthly', nextRun: 'Paused', invested: 9_000, averageCost: 1, active: false },
];

export const API_KEYS: readonly ApiKey[] = [
  { id: 'k1', label: 'Production trading bot', prefix: 'nvx_live_8fa2', scopes: ['read', 'trade'], createdAt: '2026-02-11', lastUsed: '4 minutes ago', ipAllowList: ['203.0.113.24'] },
  { id: 'k2', label: 'Portfolio reporting', prefix: 'nvx_live_c41d', scopes: ['read'], createdAt: '2025-11-02', lastUsed: '2 hours ago', ipAllowList: [] },
  { id: 'k3', label: 'Sandbox integration', prefix: 'nvx_test_19bb', scopes: ['read', 'trade', 'transfer'], createdAt: '2026-06-28', lastUsed: '3 days ago', ipAllowList: ['198.51.100.7', '198.51.100.8'] },
];

export const SESSIONS: readonly Session[] = [
  { id: 's1', device: 'MacBook Pro · Chrome 141', location: 'Zurich, CH', ip: '203.0.113.24', lastActive: 'Now', current: true },
  { id: 's2', device: `iPhone 17 Pro · ${BRAND.name} iOS`, location: 'Zurich, CH', ip: '203.0.113.51', lastActive: '18 minutes ago', current: false },
];

export const REFERRALS: readonly Referral[] = (() => {
  const rand = seededRandom(hashSeed('referrals'));
  const handles = ['@dreyes', '@sofia.l', '@tolu_a', '@m.vogel', '@priya.r', '@jkim', '@lena.w', '@omar.s', '@nkechi', '@bfrost'];
  return handles.map((handle, i) => {
    const volume = Math.round(rand() * 240_000);
    return {
      id: `ref_${i}`,
      handle,
      joined: new Date(NOW - (30 + i * 21) * DAY).toISOString(),
      volume,
      earned: Math.round(volume * 0.001 * 0.4 * 100) / 100,
      status: volume > 20_000 ? 'active' : 'dormant',
    } satisfies Referral;
  });
})();

export const REFERRAL_EARNINGS = REFERRALS.reduce((s, r) => s + r.earned, 0);
export const REFERRAL_VOLUME = REFERRALS.reduce((s, r) => s + r.volume, 0);
