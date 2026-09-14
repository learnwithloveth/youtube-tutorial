import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { TransactionKind } from './transactions';
import type { LedgerDependencies } from '../ports';

/**
 * A receipt for one transaction.
 *
 * ── What makes this a receipt rather than a rendering ──────────────────────────
 * Every figure on it is a stored fact, and the ones that are *not* stored are
 * absent rather than computed at print time:
 *
 *  - The amounts are the exact decimal strings in the ledger, never re-derived.
 *  - A deposit carries both what the customer claimed and what an operator
 *    verified, because the gap between them is what a dispute is about and a
 *    receipt that showed one number would destroy the evidence.
 *  - A withdrawal carries the USD value *frozen at request time* — the number the
 *    daily limit was actually checked against. Re-valuing at today's price would
 *    print a receipt that disagrees with the decision it documents, and that
 *    disagreement would grow every day the document sat in an inbox.
 *
 * ── There is no invoice here, and that is deliberate ───────────────────────────
 * An invoice is a demand for payment with a legal issuer, a tax treatment and a
 * sequential number that a jurisdiction cares about. None of those exist in this
 * system, and inventing a company registration or a VAT line on a document
 * somebody might file with an accountant is the worst possible place to guess.
 *
 * What this is: a record of a movement that happened, issued by whoever is
 * configured as the issuer, stating the facts the ledger holds. The page says so.
 */

export interface ReceiptLineDto {
  readonly label: string;
  /** Exact decimal string, or already-formatted text for non-amount rows. */
  readonly value: string;
  /** Rendered smaller, under the value. */
  readonly note?: string | undefined;
}

export interface ReceiptDto {
  /**
   * The reference a customer would quote.
   *
   * The record's own id, not a generated sequence. A sequential receipt number
   * implies a register that guarantees no gaps, which nothing here maintains — and
   * a number that *looks* sequential while skipping is worse than an opaque one.
   */
  readonly reference: string;
  readonly kind: TransactionKind;
  readonly userId: string;
  readonly asset: string;
  readonly network: string;
  readonly status: 'pending' | 'approved' | 'rejected';

  /** The headline figure: what actually moved, or what was asked for. */
  readonly amount: string;
  readonly lines: readonly ReceiptLineDto[];

  readonly issuedAt: string;
  readonly occurredAt: string;
  readonly decidedAt: string | null;
  readonly reason: string | null;
}

export async function getReceipt(
  deps: LedgerDependencies,
  kind: TransactionKind,
  recordId: string,
  /** When given, the receipt is only produced for that customer's own record. */
  requiredUserId?: UserId | undefined,
): Promise<ReceiptDto | null> {
  try {
    const now = deps.clock.now();

    if (kind === 'deposit') {
      const claim = await deps.claims.find(recordId);
      if (claim === null) return null;

      const snapshot = claim.snapshot();
      // Not-found rather than forbidden, for the reason the rest of this codebase
      // answers 404: confirming an id is real is the first thing worth knowing if
      // you are guessing them.
      if (requiredUserId !== undefined && snapshot.userId !== requiredUserId) return null;

      const credited = snapshot.creditedAmount;
      const lines: ReceiptLineDto[] = [
        { label: 'Amount you reported', value: `${snapshot.claimedAmount.toDecimalString()} ${snapshot.asset}` },
      ];

      if (credited !== null) {
        lines.push({
          label: 'Amount credited',
          value: `${credited.toDecimalString()} ${snapshot.asset}`,
          // Only when they differ. A note that always appears is one nobody reads,
          // and the whole point is that a discrepancy stands out.
          note: credited.toDecimalString() === snapshot.claimedAmount.toDecimalString()
            ? undefined
            : 'Differs from the amount reported. Both are kept on the record.',
        });
      }

      lines.push(
        { label: 'Network', value: snapshot.network },
        { label: 'Your reference', value: snapshot.reference },
      );

      return {
        reference: snapshot.id,
        kind,
        userId: snapshot.userId,
        asset: snapshot.asset,
        network: snapshot.network,
        status: snapshot.status,
        amount: `${(credited ?? snapshot.claimedAmount).toDecimalString()} ${snapshot.asset}`,
        lines,
        issuedAt: now.toISOString(),
        occurredAt: snapshot.submittedAt.toISOString(),
        decidedAt: snapshot.decidedAt?.toISOString() ?? null,
        reason: snapshot.reason,
      };
    }

    const withdrawal = await deps.withdrawals.find(recordId);
    if (withdrawal === null) return null;

    const snapshot = withdrawal.snapshot();
    if (requiredUserId !== undefined && snapshot.userId !== requiredUserId) return null;

    const total = snapshot.amount.add(snapshot.fee);

    return {
      reference: snapshot.id,
      kind,
      userId: snapshot.userId,
      asset: snapshot.asset,
      network: snapshot.network,
      status: snapshot.status,
      amount: `${snapshot.amount.toDecimalString()} ${snapshot.asset}`,
      lines: [
        { label: 'Amount sent', value: `${snapshot.amount.toDecimalString()} ${snapshot.asset}` },
        { label: 'Network fee', value: `${snapshot.fee.toDecimalString()} ${snapshot.asset}` },
        {
          label: 'Total debited',
          value: `${total.toDecimalString()} ${snapshot.asset}`,
          note: 'Amount plus fee, held on your account from the moment you asked.',
        },
        { label: 'Network', value: snapshot.network },
        { label: 'Destination', value: snapshot.destination },
        ...(snapshot.valuedAtUsd !== null
          ? [
              {
                label: 'Value at the time',
                value: `$${snapshot.valuedAtUsd.toDecimalString()}`,
                // Said on the document, because a reader will otherwise compare it
                // to today's price and conclude the receipt is wrong.
                note: 'The price when you made the request, not today’s.',
              },
            ]
          : []),
      ],
      issuedAt: now.toISOString(),
      occurredAt: snapshot.requestedAt.toISOString(),
      decidedAt: snapshot.decidedAt?.toISOString() ?? null,
      reason: snapshot.reason,
    };
  } catch (error) {
    logger.error({ event: 'receipt_read_failed', module: 'ledger', kind, recordId }, error);
    return null;
  }
}
