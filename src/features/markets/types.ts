export type AssetCategory = 'Layer 1' | 'Layer 2' | 'DeFi' | 'Stablecoin' | 'AI' | 'Payments' | 'Gaming' | 'RWA';

export interface Asset {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly glyph: string;
  /** Brand hue used for the asset mark, sparkline stroke and hover halo. */
  readonly hue: string;
  readonly category: AssetCategory;
  readonly price: number;
  readonly change24h: number;
  readonly change7d: number;
  readonly marketCap: number;
  readonly volume24h: number;
  readonly supply: number;
  readonly apy?: number;
  readonly blurb: string;
}

export interface Quote extends Asset {
  /** Live-jittered price, derived from `price` at runtime. */
  readonly live: number;
  readonly direction: 'up' | 'down' | 'flat';
  readonly spark: readonly number[];
}
