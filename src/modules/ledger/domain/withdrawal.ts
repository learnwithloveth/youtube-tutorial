import type { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

/**
 * A withdrawal request, and the states it may be in.
 *
 * ── Why money leaving is a request and not a command ───────────────────────────
 * Everything else a customer does on this platform either succeeds or fails at the
 * moment they do it. A withdrawal cannot: it is the one action that is irreversible
 * once it completes, and the one an attacker performs first. So it becomes a record
 * that a human decides on, and the funds are *held* — reserved but not moved —
 * until they do.
 *
 * Holding rather than moving matters. A rejected withdrawal must leave no trace on
 * the customer's statement, because nothing happened. If the request had debited
 * the account, the rejection would need a compensating credit and the statement
 * would show two movements for an event that never occurred.
 */

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface WithdrawalSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly asset: string;
  /** What the customer receives. */
  readonly amount: Money;
  /** The network fee, taken on top. Held alongside the amount. */
  readonly fee: Money;
  readonly network: string;
  readonly destination: string;
  /**
   * What the amount was worth in USD when it was requested.
   *
   * Frozen at request time, and that is deliberate: the daily limit was checked
   * against this number, so the record of the decision has to carry the number the
   * decision was made on. Re-valuing it later at a different price would mean the
   * audit trail disagreed with the rule that was actually applied.
   *
   * Null when no price was available — which `requestWithdrawal` refuses to let
   * happen, but which old rows may carry.
   */
  readonly valuedAtUsd: Money | null;
  readonly status: WithdrawalStatus;
  readonly requestedAt: Date;
  /**
   * Operators who have signed off, in order.
   *
   * A list rather than two fields because the rule is "how many" and the policy
   * decides the number. Above the dual-control threshold it is two; below it, one.
   */
  readonly approvals: readonly { readonly operatorId: UserId; readonly at: Date }[];
  readonly decidedAt: Date | null;
  readonly decidedBy: UserId | null;
  /** Required on a rejection. The customer is told, so it has to be sayable. */
  readonly reason: string | null;
}

export class Withdrawal {
  readonly id: string;
  readonly userId: UserId;
  readonly asset: string;
  readonly amount: Money;
  readonly fee: Money;
  readonly network: string;
  readonly destination: string;
  readonly valuedAtUsd: Money | null;
  readonly requestedAt: Date;
  private _status: WithdrawalStatus;
  private _approvals: { operatorId: UserId; at: Date }[];
  private _decidedAt: Date | null;
  private _decidedBy: UserId | null;
  private _reason: string | null;

  private constructor(snapshot: WithdrawalSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.asset = snapshot.asset;
    this.amount = snapshot.amount;
    this.fee = snapshot.fee;
    this.network = snapshot.network;
    this.destination = snapshot.destination;
    this.valuedAtUsd = snapshot.valuedAtUsd;
    this.requestedAt = snapshot.requestedAt;
    this._status = snapshot.status;
    this._approvals = [...snapshot.approvals];
    this._decidedAt = snapshot.decidedAt;
    this._decidedBy = snapshot.decidedBy;
    this._reason = snapshot.reason;
  }

  static request(input: {
    id: string;
    userId: UserId;
    amount: Money;
    fee: Money;
    network: string;
    destination: string;
    valuedAtUsd: Money | null;
    now: Date;
  }): Withdrawal {
    if (input.amount.isNegative || input.amount.isZero) {
      throw new RangeError('A withdrawal must be for a positive amount.');
    }
    if (input.fee.isNegative) {
      throw new RangeError('A fee cannot be negative.');
    }
    if (input.amount.currency !== input.fee.currency) {
      throw new TypeError('The fee must be denominated in the asset being withdrawn.');
    }

    return new Withdrawal({
      id: input.id,
      userId: input.userId,
      asset: input.amount.currency,
      amount: input.amount,
      fee: input.fee,
      network: input.network,
      destination: input.destination,
      valuedAtUsd: input.valuedAtUsd,
      status: 'pending',
      requestedAt: input.now,
      approvals: [],
      decidedAt: null,
      decidedBy: null,
      reason: null,
    });
  }

  static rehydrate(snapshot: WithdrawalSnapshot): Withdrawal {
    return new Withdrawal(snapshot);
  }

  get status(): WithdrawalStatus {
    return this._status;
  }
  get approvals(): readonly { operatorId: UserId; at: Date }[] {
    return this._approvals;
  }
  get decidedAt(): Date | null {
    return this._decidedAt;
  }
  get decidedBy(): UserId | null {
    return this._decidedBy;
  }
  get reason(): string | null {
    return this._reason;
  }

  /** Amount plus fee: what is reserved on the customer's account. */
  get totalReserved(): Money {
    return this.amount.add(this.fee);
  }

  /**
   * Records one operator's approval.
   *
   * Returns whether the withdrawal is now fully approved, because the caller has to
   * know whether to move money or merely to note a signature.
   *
   * Two rules existed here, against the same insider risk. One is still enforced:
   *
   *  - An operator cannot approve twice. Otherwise dual control is one person
   *    clicking the same button in two tabs. This one holds, in the domain and in
   *    a unique index on `withdrawal_approvals`.
   *  - An operator cannot approve their own withdrawal — **currently lifted**. The
   *    threshold that makes a payment need two signatures is worth nothing if one
   *    of them may be the person being paid, so this is a real control and not a
   *    formality. It is commented out below rather than deleted, for a deployment
   *    used to teach people how withdrawals work, where an operator walking through
   *    the flow on their own account is the ordinary case.
   *
   * Restore it before this platform holds anybody's real money. With it off, an
   * operator can pay themselves out to any address up to the dual-control
   * threshold on a single signature, and the record will look perfectly ordinary.
   * The matching rule on deposits is lifted too — see `DepositClaim.approve`.
   */
  approve(operatorId: UserId, required: number, now: Date): boolean {
    this.assertPending();

    // Restore this to re-enable the rule. See the note above for what it costs.
    // if (operatorId === this.userId) {
    //   throw new RangeError('An operator cannot approve their own withdrawal.');
    // }
    if (this._approvals.some((approval) => approval.operatorId === operatorId)) {
      throw new RangeError('This operator has already approved this withdrawal.');
    }

    this._approvals.push({ operatorId, at: now });

    if (this._approvals.length < required) return false;

    this._status = 'approved';
    this._decidedAt = now;
    this._decidedBy = operatorId;
    return true;
  }

  /**
   * Refuses the withdrawal.
   *
   * One operator can reject regardless of how many approvals it would have needed.
   * Declining to move money is always safe; requiring a second signature to *stop*
   * a payment would mean a single operator who spots fraud cannot act on it.
   */
  reject(operatorId: UserId, reason: string, now: Date): void {
    this.assertPending();

    const stated = reason.trim();
    if (stated.length === 0) {
      throw new RangeError('A rejection requires a reason; the customer is told.');
    }

    this._status = 'rejected';
    this._decidedAt = now;
    this._decidedBy = operatorId;
    this._reason = stated;
  }

  private assertPending(): void {
    if (this._status !== 'pending') {
      throw new RangeError(`Withdrawal ${this.id} is already ${this._status}.`);
    }
  }

  snapshot(): WithdrawalSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      asset: this.asset,
      amount: this.amount,
      fee: this.fee,
      network: this.network,
      destination: this.destination,
      valuedAtUsd: this.valuedAtUsd,
      status: this._status,
      requestedAt: this.requestedAt,
      approvals: this._approvals,
      decidedAt: this._decidedAt,
      decidedBy: this._decidedBy,
      reason: this._reason,
    };
  }
}
