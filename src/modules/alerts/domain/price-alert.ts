import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

/**
 * A customer asking to be told when a price crosses a level.
 *
 * ── Fire once, then stay quiet ────────────────────────────────────────────────
 * An alert that keeps firing while the price hovers at the level produces forty
 * notifications in an afternoon, and the reaction to that is to turn alerts off —
 * which loses the one that mattered too. So firing moves the alert to `triggered`
 * and it stays there until the customer re-arms it. The screen has always said
 * this; now the aggregate enforces it.
 *
 * ── Crossing is `>=`, not `>` ─────────────────────────────────────────────────
 * "Tell me when BTC is above 100,000" is satisfied by exactly 100,000. A strict
 * comparison would skip a level hit precisely, which is the one a person picked
 * deliberately and the one they will check afterwards.
 *
 * ── The target is `Money`, like every other amount here ───────────────────────
 * A price alert is a comparison against a quoted price, and quoted prices are
 * exact decimal strings. Comparing them as floats would make an alert at 0.00002341
 * fire at the wrong moment, or never — see ADR 0002.
 */

export type AlertDirection = 'above' | 'below';

/**
 * `armed` is watching, `triggered` has fired and is waiting to be re-armed,
 * `muted` was switched off by the customer and is not watching.
 */
export type AlertStatus = 'armed' | 'triggered' | 'muted';

/** The scale every alert target is held at. Matches the quote scale of USD prices. */
export const TARGET_SCALE = 8;

/** Most alerts one account may hold. A guard on a table anybody can insert into. */
export const MAX_ALERTS_PER_USER = 50;

export interface PriceAlertSnapshot {
  readonly id: string;
  readonly userId: UserId;
  /** Instrument symbol, upper case — `BTC`, not `btc`. */
  readonly symbol: string;
  readonly direction: AlertDirection;
  readonly target: Money;
  readonly status: AlertStatus;
  readonly createdAt: Date;
  readonly triggeredAt: Date | null;
  /** The price that satisfied it. Kept so the notification can state a fact. */
  readonly triggeredPrice: Money | null;
}

export class PriceAlert {
  readonly id: string;
  readonly userId: UserId;
  readonly symbol: string;
  readonly direction: AlertDirection;
  readonly target: Money;
  readonly createdAt: Date;
  private _status: AlertStatus;
  private _triggeredAt: Date | null;
  private _triggeredPrice: Money | null;

  private constructor(snapshot: PriceAlertSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.symbol = snapshot.symbol;
    this.direction = snapshot.direction;
    this.target = snapshot.target;
    this.createdAt = snapshot.createdAt;
    this._status = snapshot.status;
    this._triggeredAt = snapshot.triggeredAt;
    this._triggeredPrice = snapshot.triggeredPrice;
  }

  static create(input: {
    id: string;
    userId: UserId;
    symbol: string;
    direction: AlertDirection;
    target: Money;
    now: Date;
  }): PriceAlert {
    const symbol = input.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(symbol)) {
      throw new RangeError('An alert needs an instrument symbol.');
    }
    if (input.target.isNegative || input.target.isZero) {
      throw new RangeError('An alert target must be a positive price.');
    }

    return new PriceAlert({
      id: input.id,
      userId: input.userId,
      symbol,
      direction: input.direction,
      target: input.target,
      status: 'armed',
      createdAt: input.now,
      triggeredAt: null,
      triggeredPrice: null,
    });
  }

  static rehydrate(snapshot: PriceAlertSnapshot): PriceAlert {
    return new PriceAlert(snapshot);
  }

  get status(): AlertStatus {
    return this._status;
  }

  get isArmed(): boolean {
    return this._status === 'armed';
  }

  /**
   * Whether this price satisfies the alert right now.
   *
   * Only an armed alert can be satisfied — a triggered one has already had its
   * say, and a muted one is not watching. That check is here rather than at the
   * call site so no evaluator can forget it.
   */
  isSatisfiedBy(price: Money): boolean {
    if (this._status !== 'armed') return false;

    // Restated to the target's scale before comparing: `Money.compare` refuses two
    // different scales outright, and a quote arrives at whatever precision its
    // instrument is quoted to.
    const comparable = price.withScale(this.target.scale);
    return this.direction === 'above'
      ? comparable.compare(this.target) >= 0
      : comparable.compare(this.target) <= 0;
  }

  fire(price: Money, now: Date): void {
    if (this._status !== 'armed') {
      throw new Error(`A ${this._status} alert cannot fire.`);
    }
    this._status = 'triggered';
    this._triggeredAt = now;
    this._triggeredPrice = price.withScale(this.target.scale);
  }

  /** Switched off. Keeps its history — re-arming does not forget it fired. */
  mute(): void {
    this._status = 'muted';
  }

  /** Watching again. */
  rearm(): void {
    this._status = 'armed';
  }

  snapshot(): PriceAlertSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      symbol: this.symbol,
      direction: this.direction,
      target: this.target,
      status: this._status,
      createdAt: this.createdAt,
      triggeredAt: this._triggeredAt,
      triggeredPrice: this._triggeredPrice,
    };
  }
}

/** Parses a customer-typed target into the scale alerts are held at. */
export function parseTarget(value: string): Money {
  return Money.fromDecimalString(value.trim(), 'USD', TARGET_SCALE);
}
