import type { Money } from '@/shared/kernel';

import type { AccountId } from './account';

/**
 * A transfer: a set of entries that must balance.
 *
 * ── The invariant is the whole type ────────────────────────────────────────────
 * `sum(delta) === 0`, per asset, enforced in the constructor. Everything else here
 * is bookkeeping around that one rule.
 *
 * It is checked in the domain rather than by a database constraint or a review
 * convention because it is the property that makes the ledger a ledger. A system
 * that can write an unbalanced transfer can create money, and it will eventually
 * do so through a branch nobody tested — a caller that forgot the fee leg, an
 * early return between two writes. Making the balanced set the only constructible
 * thing means the unbalanced case has no representation to reach.
 *
 * ── Per asset, not overall ─────────────────────────────────────────────────────
 * A transfer may touch several assets — a trade moves BTC one way and USD the
 * other — and those legs cannot offset each other. Summing across assets would let
 * "−1 BTC, +1 USD" pass as balanced, which is how a ledger loses a bitcoin and
 * reports that everything adds up.
 */

export type TransferKind =
  | 'deposit'
  | 'withdrawal'
  | 'withdrawal-fee'
  | 'adjustment'
  | 'demo-credit';

export interface Entry {
  readonly accountId: AccountId;
  /** Positive credits the account, negative debits it. */
  readonly delta: Money;
}

export interface TransferSnapshot {
  readonly id: string;
  readonly kind: TransferKind;
  readonly entries: readonly Entry[];
  readonly occurredAt: Date;
  /**
   * What this transfer was for, in the operator's words.
   *
   * Required. An adjustment with no stated reason is the line item nobody can
   * explain six months later, and the one an auditor asks about first.
   */
  readonly reference: string;
  /**
   * The chain this movement belongs to, by network id — `tron`, `ethereum`.
   *
   * Null where the question does not apply: a withdrawal fee is an internal
   * movement between two platform accounts and crosses no chain at all.
   *
   * It is stored on the transfer rather than looked up through the record behind
   * it because a statement line *is* an entry, and an entry that cannot say which
   * chain it happened on is one the customer has to go somewhere else to
   * understand. USDT is the case that forces it: the same asset, the same balance,
   * two completely different networks with different fees and different addresses.
   */
  readonly network: string | null;
  /**
   * The transaction on that chain.
   *
   * Three sources, and they are not equally solid, which is why the field is
   * nullable rather than defaulted:
   *
   *  - a **deposit** carries the hash the customer gave when they claimed it;
   *  - a **withdrawal** carries null, always. This platform's payout path ends at
   *    `payable` and nothing is ever broadcast, so there is no transaction to name
   *    and inventing one would assert a payment that did not happen;
   *  - a **demo credit** carries a derived, chain-shaped value — see
   *    `chain-reference.ts` for why that is not the same as inventing a fact.
   */
  readonly txHash: string | null;
}

export class Transfer {
  readonly id: string;
  readonly kind: TransferKind;
  readonly entries: readonly Entry[];
  readonly occurredAt: Date;
  readonly reference: string;
  readonly network: string | null;
  readonly txHash: string | null;

  private constructor(snapshot: TransferSnapshot) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.entries = snapshot.entries;
    this.occurredAt = snapshot.occurredAt;
    this.reference = snapshot.reference;
    this.network = snapshot.network;
    this.txHash = snapshot.txHash;
  }

  static create(snapshot: TransferSnapshot): Transfer {
    if (snapshot.entries.length < 2) {
      throw new RangeError('A transfer needs at least two entries; one leg is not a transfer.');
    }
    if (Number.isNaN(snapshot.occurredAt.getTime())) {
      throw new TypeError('A transfer requires a valid time.');
    }
    if (snapshot.reference.trim().length === 0) {
      throw new RangeError('A transfer requires a reference.');
    }

    assertBalanced(snapshot.entries);

    return new Transfer(snapshot);
  }

  /**
   * Rebuilds a stored transfer.
   *
   * Re-checks the invariant rather than trusting the rows. Storage is usually
   * trusted in this codebase, but the thing being trusted here is that no
   * migration, backfill or manual `UPDATE` has ever unbalanced a transfer — and
   * the cost of checking is a loop over two or three entries.
   */
  static rehydrate(snapshot: TransferSnapshot): Transfer {
    assertBalanced(snapshot.entries);
    return new Transfer(snapshot);
  }

  /** The assets this transfer touched, for callers that reconcile per asset. */
  get assets(): readonly string[] {
    return [...new Set(this.entries.map((entry) => entry.delta.currency))];
  }
}

function assertBalanced(entries: readonly Entry[]): void {
  const totals = new Map<string, Money>();

  for (const entry of entries) {
    const asset = entry.delta.currency;
    const running = totals.get(asset);
    // `Money.add` throws across mismatched scales, which is the other way a set of
    // entries can look balanced and not be: 1.00 USD and 1.000000 USD are the same
    // amount written two ways, and summing them without a common scale is a bug.
    totals.set(asset, running === undefined ? entry.delta : running.add(entry.delta));
  }

  for (const [asset, total] of totals) {
    if (!total.isZero) {
      throw new RangeError(
        `Transfer does not balance in ${asset}: entries sum to ${total.toDecimalString()}.`,
      );
    }
  }
}
