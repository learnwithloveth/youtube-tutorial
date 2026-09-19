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

/**
 * Where a claim stands.
 *
 *   `pending`     filed, and waiting on an operator to look
 *   `confirming`  an operator has looked, and it is waiting on the chain
 *   `approved`    verified and credited
 *   `rejected`    refused, with a reason the customer is shown
 *
 * ── Why `confirming` is not just `pending` with a note ────────────────────────
 * The two wait on different things, and the customer's next move differs. A
 * pending claim is waiting on a person, and if it sits there for a day something
 * is wrong with the queue. A confirming one is waiting on a block, and a day is
 * sometimes simply what that takes — the operator has already seen the evidence
 * and is not the bottleneck.
 *
 * Collapsing them would mean a customer watching "submitted" for an hour with no
 * way to tell whether anybody had looked, which is the state that generates the
 * support ticket. It is also the distinction a workshop is trying to demonstrate:
 * the gap between sending a transaction and it being spendable is the thing
 * people new to this find surprising.
 *
 * It is not a decision. Nothing moves, `decidedAt` and `decidedBy` stay null, and
 * the claim stays in the operator's queue — from here it still becomes approved or
 * rejected like any other.
 */
export type DepositClaimStatus = 'pending' | 'confirming' | 'approved' | 'rejected';

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
   * Empty on anything submitted since the form stopped asking for one.
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
  /**
   * When an operator marked it as waiting on the chain. Null if never marked.
   *
   * Kept beside `decidedAt` rather than sharing it, because they answer different
   * questions — "when was this looked at" and "when was this settled" — and a
   * claim that went straight from pending to approved has the second and not the
   * first.
   */
  readonly confirmingAt: Date | null;
  readonly confirmingBy: UserId | null;
  /**
   * What the operator said while it confirms — "3 of 6 confirmations, ~20 min".
   *
   * Optional, and its own field rather than `reason`. That one means "why this was
   * refused" and is rendered as a refusal wherever it appears; putting a progress
   * note in it would have the customer's wallet explain a rejection that did not
   * happen.
   */
  readonly confirmingNote: string | null;
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
  private _confirmingAt: Date | null;
  private _confirmingBy: UserId | null;
  private _confirmingNote: string | null;
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
    this._confirmingAt = snapshot.confirmingAt;
    this._confirmingBy = snapshot.confirmingBy;
    this._confirmingNote = snapshot.confirmingNote;
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

    /*
     * A reference is welcome and no longer required.
     *
     * It was an invariant here, which is the right place for an invariant — but it
     * was never one: a claim with no hash is perfectly approvable, because what
     * approves it is an operator finding the transfer and crediting the amount
     * they verified. The proof below is the thing a claim genuinely cannot be
     * without, and that check stays.
     *
     * The length bound stays too. It is an untrusted string of unbounded size,
     * which is a different concern from whether it is present.
     */
    const reference = input.reference.trim();
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
      confirmingAt: null,
      confirmingBy: null,
      confirmingNote: null,
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
  get confirmingAt(): Date | null {
    return this._confirmingAt;
  }
  get confirmingBy(): UserId | null {
    return this._confirmingBy;
  }
  get confirmingNote(): string | null {
    return this._confirmingNote;
  }
  /** Still the operator's to decide — pending and confirming both are. */
  get isUndecided(): boolean {
    return this._status === 'pending' || this._status === 'confirming';
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
   * ── The self-approval rule is currently lifted, and that is a real trade ─────
   * An operator used to be refused their own claim — the rule that governs
   * withdrawals, applied with more force, because crediting is the cheaper fraud:
   * it needs no counterparty and leaves the platform short only when custody is
   * next reconciled. The check is commented out below rather than deleted, because
   * it is the line to restore and nothing else has to change with it.
   *
   * It is lifted for the workshop deployment, where a tutor demonstrating the
   * deposit flow on their own account is the ordinary case and the only "funds" in
   * play are ones an operator could issue outright from the demo-funds screen
   * anyway. On a deployment holding real customer money it should go back: with it
   * off, a single compromised console account can credit itself any amount, and
   * the only thing that surfaces it is the next custody reconciliation.
   */
  approve(operatorId: UserId, credited: Money, transferId: string, now: Date): void {
    this.assertUndecided();

    // Restore this to re-enable the rule. See the note above for what it costs to
    // leave it off.
    // if (operatorId === this.userId) {
    //   throw new RangeError('An operator cannot approve their own deposit.');
    // }
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

  /**
   * Says the evidence has been seen and the chain is what is being waited on.
   *
   * ── No self-approval guard here, and there would be no point in one ──────────
   * Nothing is credited and no balance moves, so the guard `approve` carries — see
   * that method for its current state — would buy nothing here even when it is on.
   * The worst an operator can do to their own claim with this is tell themselves
   * to keep waiting.
   *
   * Only from `pending`. Marking an already-confirming claim again is a no-op
   * dressed as an action, and it would overwrite the timestamp that says how long
   * it has been waiting.
   */
  markConfirming(operatorId: UserId, note: string, now: Date): void {
    if (this._status !== 'pending') {
      throw new RangeError(`Deposit claim ${this.id} is already ${this._status}.`);
    }

    const stated = note.trim();
    this._status = 'confirming';
    this._confirmingAt = now;
    this._confirmingBy = operatorId;
    this._confirmingNote = stated.length > 0 ? stated : null;
  }

  reject(operatorId: UserId, reason: string, now: Date): void {
    this.assertUndecided();

    const stated = reason.trim();
    if (stated.length === 0) {
      throw new RangeError('A rejection requires a reason; the customer is told.');
    }

    this._status = 'rejected';
    this._decidedAt = now;
    this._decidedBy = operatorId;
    this._reason = stated;
  }

  /**
   * Refuses a second decision, and only a second decision.
   *
   * `confirming` passes: it is a claim an operator has seen and not yet settled,
   * which is exactly what approving or rejecting is for. Only `approved` and
   * `rejected` are terminal.
   */
  private assertUndecided(): void {
    if (!this.isUndecided) {
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
      confirmingAt: this._confirmingAt,
      confirmingBy: this._confirmingBy,
      confirmingNote: this._confirmingNote,
      decidedAt: this._decidedAt,
      decidedBy: this._decidedBy,
      reason: this._reason,
      transferId: this._transferId,
    };
  }
}
