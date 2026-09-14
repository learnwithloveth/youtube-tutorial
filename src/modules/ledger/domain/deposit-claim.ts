import type { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

/**
 * A customer's claim that money arrived, with evidence, awaiting confirmation.
 *
 * ── Why a claim and not a deposit ──────────────────────────────────────────────
 * The customer is asserting something this platform cannot see. There is no chain
 * listener and no banking webhook here, so nobody on this side of the wire knows a
 * transaction happened until a person checks. A claim is therefore *evidence
 * submitted*, not money credited — and calling it a deposit before an operator has
 * looked would make a form into a mint.
 *
 * ── The stated amount is a claim, not an instruction ───────────────────────────
 * `claimedAmount` is what the customer says they sent. `creditedAmount` is what an
 * operator verified actually arrived, and they are allowed to differ: people mistype,
 * networks take fees, and a partial send is common. The ledger credits the second
 * number, and both are kept so a dispute can be read afterwards — "you said 0.5, we
 * found 0.4998" is a conversation the record has to be able to support.
 *
 * ── Proof is required, and that is the whole point ─────────────────────────────
 * A claim with no proof is a request to be given money. The aggregate cannot be
 * constructed without a proof reference, so there is no path through the code that
 * produces an unevidenced claim for an operator to approve by accident.
 */

export type DepositClaimStatus = 'pending' | 'approved' | 'rejected';

export interface DepositClaimSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly asset: string;
  readonly network: string;
  /** What the customer says they sent. */
  readonly claimedAmount: Money;
  /**
   * What the operator verified arrived. Null until approved.
   *
   * Separate from the claim rather than overwriting it: the difference between the
   * two is exactly what a dispute is about, and a single field would destroy the
   * evidence by recording the answer over the question.
   */
  readonly creditedAmount: Money | null;
  /**
   * The customer's own reference — a transaction hash, a bank reference.
   *
   * Required. It is the thing an operator checks the screenshot against, and a
   * claim that cannot be looked up independently is a claim backed only by a
   * picture, which is the easiest kind to forge.
   */
  readonly reference: string;
  /** Key of the stored proof image. Never a filename the customer chose. */
  readonly proofId: string;
  readonly status: DepositClaimStatus;
  readonly submittedAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: UserId | null;
  /** Required on a rejection. The customer is told. */
  readonly reason: string | null;
  /** The transfer that credited the funds, once approved. */
  readonly transferId: string | null;
}

/** Longest customer-supplied reference stored. Bounds an untrusted field. */
export const MAX_REFERENCE_LENGTH = 200;

export class DepositClaim {
  readonly id: string;
  readonly userId: UserId;
  readonly asset: string;
  readonly network: string;
  readonly claimedAmount: Money;
  readonly reference: string;
  readonly proofId: string;
  readonly submittedAt: Date;
  private _creditedAmount: Money | null;
  private _status: DepositClaimStatus;
  private _decidedAt: Date | null;
  private _decidedBy: UserId | null;
  private _reason: string | null;
  private _transferId: string | null;

  private constructor(snapshot: DepositClaimSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.asset = snapshot.asset;
    this.network = snapshot.network;
    this.claimedAmount = snapshot.claimedAmount;
    this.reference = snapshot.reference;
    this.proofId = snapshot.proofId;
    this.submittedAt = snapshot.submittedAt;
    this._creditedAmount = snapshot.creditedAmount;
    this._status = snapshot.status;
    this._decidedAt = snapshot.decidedAt;
    this._decidedBy = snapshot.decidedBy;
    this._reason = snapshot.reason;
    this._transferId = snapshot.transferId;
  }

  static submit(input: {
    id: string;
    userId: UserId;
    network: string;
    claimedAmount: Money;
    reference: string;
    proofId: string;
    now: Date;
  }): DepositClaim {
    if (input.claimedAmount.isNegative || input.claimedAmount.isZero) {
      throw new RangeError('A deposit claim must state a positive amount.');
    }

    const reference = input.reference.trim();
    if (reference.length === 0) {
      throw new RangeError('A deposit claim requires a transaction reference.');
    }
    if (reference.length > MAX_REFERENCE_LENGTH) {
      throw new RangeError('The reference is too long.');
    }
    // Not defensive padding: the aggregate is the last place that can guarantee an
    // approvable claim has something to approve.
    if (input.proofId.trim().length === 0) {
      throw new RangeError('A deposit claim requires proof.');
    }

    return new DepositClaim({
      id: input.id,
      userId: input.userId,
      asset: input.claimedAmount.currency,
      network: input.network,
      claimedAmount: input.claimedAmount,
      creditedAmount: null,
      reference,
      proofId: input.proofId,
      status: 'pending',
      submittedAt: input.now,
      decidedAt: null,
      decidedBy: null,
      reason: null,
      transferId: null,
    });
  }

  static rehydrate(snapshot: DepositClaimSnapshot): DepositClaim {
    return new DepositClaim(snapshot);
  }

  get status(): DepositClaimStatus {
    return this._status;
  }
  get creditedAmount(): Money | null {
    return this._creditedAmount;
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
  get transferId(): string | null {
    return this._transferId;
  }

  /**
   * Confirms the deposit for the amount the operator actually verified.
   *
   * An operator may not approve their own claim. The rule is the one that governs
   * withdrawals, for the same reason and with more force: crediting is the cheaper
   * fraud, since it needs no counterparty and leaves the platform short only when
   * custody is next reconciled.
   */
  approve(operatorId: UserId, credited: Money, transferId: string, now: Date): void {
    this.assertPending();

    if (operatorId === this.userId) {
      throw new RangeError('An operator cannot approve their own deposit.');
    }
    if (credited.currency !== this.claimedAmount.currency) {
      throw new TypeError('The credited amount must be in the asset that was claimed.');
    }
    if (credited.isNegative || credited.isZero) {
      throw new RangeError('An approved deposit must credit a positive amount.');
    }

    this._creditedAmount = credited;
    this._status = 'approved';
    this._decidedAt = now;
    this._decidedBy = operatorId;
    this._transferId = transferId;
  }

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
      throw new RangeError(`Deposit claim ${this.id} is already ${this._status}.`);
    }
  }

  snapshot(): DepositClaimSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      asset: this.asset,
      network: this.network,
      claimedAmount: this.claimedAmount,
      creditedAmount: this._creditedAmount,
      reference: this.reference,
      proofId: this.proofId,
      status: this._status,
      submittedAt: this.submittedAt,
      decidedAt: this._decidedAt,
      decidedBy: this._decidedBy,
      reason: this._reason,
      transferId: this._transferId,
    };
  }
}
