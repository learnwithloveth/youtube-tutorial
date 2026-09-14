import { BasisPoints } from '@/shared/kernel';

/**
 * A staking yield, as observed somewhere real.
 *
 * ── Why this replaced an editorial number ──────────────────────────────────────
 * `Instrument` carries `stakingYieldBasisPoints`, written by hand in the catalogue
 * alongside the blurb and the brand hue. That was fine while it was decoration on
 * a marketing page and wrong the moment a customer could act on it: a yield is a
 * market observation that moves daily, not a property of an asset that a writer
 * decides.
 *
 * So a real yield carries where it was observed — which protocol, on which chain,
 * against how much value — because those are what make one number comparable to
 * another. "ETH earns 2.2%" is not a fact about ether; it is a fact about Lido on
 * Ethereum this week, and an operator or a customer deciding anything needs to
 * know which.
 *
 * ── Bitcoin earns nothing, and that is the right answer ────────────────────────
 * Bitcoin has no native staking. Any non-zero BTC "yield" is a lending or
 * wrapped-asset product with counterparty risk that ether staking does not have.
 * The honest rendering is a near-zero rate against a named protocol, not a blank
 * and not an invented number — which is what the fixture it replaced showed.
 */

export interface StakingYieldSnapshot {
  readonly symbol: string;
  /** The protocol the rate was observed at, e.g. `lido`. */
  readonly protocol: string;
  readonly chain: string;
  readonly apy: BasisPoints;
  /**
   * The base rate, excluding token incentives, when the source separates them.
   *
   * Worth keeping apart: a headline rate propped up by an emissions programme is a
   * different proposition from one paid out of protocol revenue, and the second is
   * the one that survives the programme ending.
   */
  readonly baseApy: BasisPoints | null;
  /** Value staked in the pool, in USD. A size, so a plain number is honest here. */
  readonly tvlUsd: number;
  /** The exact ticker the pool is denominated in, e.g. `STETH` for ETH staking. */
  readonly poolSymbol: string;
  readonly observedAt: Date;
}

export class StakingYield {
  readonly symbol: string;
  readonly protocol: string;
  readonly chain: string;
  readonly apy: BasisPoints;
  readonly baseApy: BasisPoints | null;
  readonly tvlUsd: number;
  readonly poolSymbol: string;
  readonly observedAt: Date;

  private constructor(snapshot: StakingYieldSnapshot) {
    this.symbol = snapshot.symbol;
    this.protocol = snapshot.protocol;
    this.chain = snapshot.chain;
    this.apy = snapshot.apy;
    this.baseApy = snapshot.baseApy;
    this.tvlUsd = snapshot.tvlUsd;
    this.poolSymbol = snapshot.poolSymbol;
    this.observedAt = snapshot.observedAt;
  }

  static create(snapshot: StakingYieldSnapshot): StakingYield {
    if (Number.isNaN(snapshot.observedAt.getTime())) {
      throw new TypeError('A staking yield requires a valid observation time.');
    }
    if (!Number.isFinite(snapshot.tvlUsd) || snapshot.tvlUsd < 0) {
      throw new RangeError('Value staked cannot be negative.');
    }
    return new StakingYield(snapshot);
  }

  /**
   * How much of the headline rate is paid in incentive tokens.
   *
   * Null when the source does not separate the two, which is different from zero —
   * "no incentives" and "we were not told" should not render the same way.
   */
  get rewardApy(): BasisPoints | null {
    if (this.baseApy === null) return null;
    return BasisPoints.of(this.apy.value - this.baseApy.value);
  }
}
