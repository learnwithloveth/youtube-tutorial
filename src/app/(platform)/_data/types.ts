import type { Asset } from '../../_console/data/market-types';

export interface Holding {
  readonly asset: Asset;
  readonly quantity: number;
  /** Average price paid, in quote currency. */
  readonly costBasis: number;
  readonly staked: number;
}

export interface ValuedHolding extends Holding {
  readonly value: number;
  readonly invested: number;
  readonly pnl: number;
  readonly pnlPercent: number;
  readonly weight: number;
}

export type TxKind = 'buy' | 'sell' | 'convert' | 'deposit' | 'withdrawal' | 'reward' | 'stake' | 'unstake';
export type TxStatus = 'completed' | 'pending' | 'failed';

export interface Transaction {
  readonly id: string;
  readonly kind: TxKind;
  readonly symbol: string;
  readonly quantity: number;
  readonly value: number;
  readonly fee: number;
  readonly status: TxStatus;
  readonly timestamp: string;
  readonly reference: string;
  readonly network?: string;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market' | 'stop-limit';

export interface Order {
  readonly id: string;
  readonly market: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly price: number;
  readonly size: number;
  readonly filled: number;
  readonly placedAt: string;
}

export interface Fill {
  readonly id: string;
  readonly market: string;
  readonly side: OrderSide;
  readonly price: number;
  readonly size: number;
  readonly fee: number;
  readonly filledAt: string;
  readonly role: 'maker' | 'taker';
}

// Chart shapes belong to the charts; re-exported here so the dashboard pages
// keep importing every fixture type from one place.
export type { BookLevel, Candle } from '@/shared/ui/charts/types';

export interface StakePosition {
  readonly symbol: string;
  readonly name: string;
  readonly hue: string;
  readonly glyph: string;
  readonly staked: number;
  readonly value: number;
  readonly apy: number;
  readonly earnedToDate: number;
  readonly nextPayout: string;
  readonly unbonding: string;
}

export interface PriceAlert {
  readonly id: string;
  readonly symbol: string;
  readonly direction: 'above' | 'below';
  readonly target: number;
  readonly createdAt: string;
  readonly active: boolean;
  readonly channel: 'push' | 'email' | 'both';
}

export interface RecurringPlan {
  readonly id: string;
  readonly symbol: string;
  readonly amount: number;
  readonly cadence: 'Daily' | 'Weekly' | 'Every 2 weeks' | 'Monthly';
  readonly nextRun: string;
  readonly invested: number;
  readonly averageCost: number;
  readonly active: boolean;
}

export interface ApiKey {
  readonly id: string;
  readonly label: string;
  readonly prefix: string;
  readonly scopes: readonly string[];
  readonly createdAt: string;
  readonly lastUsed: string;
  readonly ipAllowList: readonly string[];
}

export interface Session {
  readonly id: string;
  readonly device: string;
  readonly location: string;
  readonly ip: string;
  readonly lastActive: string;
  readonly current: boolean;
}

export interface Referral {
  readonly id: string;
  readonly handle: string;
  readonly joined: string;
  readonly volume: number;
  readonly earned: number;
  readonly status: 'active' | 'dormant';
}

export interface SeriesPoint {
  readonly t: number;
  readonly v: number;
}
