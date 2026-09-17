import { logger } from '@/platform/observability/logger';
import type { Money } from '@/shared/kernel';
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
 *  - The amounts are the exact values in the ledger, never re-derived and never
 *    rounded. They are printed with their trailing zeros dropped — see
 *    `amountText`, which is where the one display decision on this page lives.
 *  - A deposit carries both what the customer claimed and what an operator
 *    verified, because the gap between them is what a dispute is about and a
 *    receipt that showed one number would destroy the evidence.
 *  - A withdrawal carries the USD value *frozen at request time* — the number the
 *    daily limit was actually checked against. Re-valuing at today's price would
 *    print a receipt that disagrees with the decision it documents, and that
 *    disagreement would grow every day the document sat in an inbox.
 *
 * ── What is deliberately *not* on it ───────────────────────────────────────────
 * No confirmation count, no block height, no transaction hash. Wallet apps put
 * those under a "Blockchain — Confirmed" line, and this platform does not
 * broadcast: an approved withdrawal is *payable*, which is a different claim.
 * Printing "Confirmed" from a state this system never observed would be the most
 * damaging invention available on this page.
 *
 * ── There is no invoice here, and that is deliberate ───────────────────────────
 * An invoice is a demand for payment with a legal issuer, a tax treatment and a
 * sequential number that a jurisdiction cares about. None of those exist in this
 * system, and inventing a company registration or a VAT line on a document
 * somebody might file with an accountant is the worst possible place to guess.
 *
 * What this is: a record of a movement that happened, stating the facts the ledger
 * holds. The page says so.
 */

export interface ReceiptLineDto {
  readonly label: string;
  /** Already rendered: an amount through `amountText`, or plain text. */
  readonly value: string;
  /** Rendered smaller, under the value. */
  readonly note?: string | undefined;
  /**
   * Render in the monospace face.
   *
   * True for anything a reader compares character by character — an amount, an
   * address, a reference. False for prose like a network's name, which set in
   * monospace reads as a machine identifier and invites somebody to paste it
   * somewhere that wants one.
   */
  readonly mono?: boolean | undefined;
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
  /** The asset's code, e.g. `BTC`. */
  readonly asset: string;
  /** The asset's name, e.g. `Bitcoin` — what the document is titled with. */
  readonly assetName: string;
  readonly network: string;
  /** The network's human label, e.g. `Ethereum (ERC-20)`. Falls back to the id. */
  readonly networkLabel: string;
  readonly status: 'pending' | 'approved' | 'rejected';

  /**
   * What actually moved, or what was asked for, with **no ticker** — pair it
   * with `asset`. Rendered by `amountText`: the exact value, trailing zeros
   * dropped.
   */
  readonly amount: string;

  /**
   * The other side of the movement, for the line under the title: the destination
   * address for a withdrawal, the customer's own reference for a deposit. Null
   * when a deposit was claimed without one.
   */
  readonly counterparty: string | null;
  readonly counterpartyLabel: string;

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
      const network = labelForNetwork(deps, snapshot.asset, snapshot.network);

      const lines: ReceiptLineDto[] = [
        {
          label: 'Amount you reported',
          value: amountText(snapshot.claimedAmount, snapshot.asset),
          mono: true,
        },
      ];

      if (credited !== null) {
        lines.push({
          label: 'Amount credited',
          value: amountText(credited, snapshot.asset),
          mono: true,
          // Only when they differ. A note that always appears is one nobody reads,
          // and the whole point is that a discrepancy stands out.
          note:
            credited.toDecimalString() === snapshot.claimedAmount.toDecimalString()
              ? undefined
              : 'Differs from the amount reported. Both are kept on the record.',
        });
      }

      lines.push(
        { label: 'Network', value: network },
        { label: 'Your reference', value: snapshot.reference, mono: true },
      );

      return {
        reference: snapshot.id,
        kind,
        userId: snapshot.userId,
        asset: snapshot.asset,
        assetName: nameForAsset(deps, snapshot.asset),
        network: snapshot.network,
        networkLabel: network,
        status: snapshot.status,
        amount: (credited ?? snapshot.claimedAmount).toTrimmedString(),
        counterparty: snapshot.reference === '' ? null : snapshot.reference,
        counterpartyLabel: 'Your reference',
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
    const network = labelForNetwork(deps, snapshot.asset, snapshot.network);

    return {
      reference: snapshot.id,
      kind,
      userId: snapshot.userId,
      asset: snapshot.asset,
      assetName: nameForAsset(deps, snapshot.asset),
      network: snapshot.network,
      networkLabel: network,
      status: snapshot.status,
      amount: snapshot.amount.toTrimmedString(),
      counterparty: snapshot.destination,
      counterpartyLabel: 'To',
      lines: [
        {
          // "Sent" only once it was: a request still waiting, or refused, sent nothing.
          label: snapshot.status === 'approved' ? 'Amount sent' : 'Amount requested',
          value: amountText(snapshot.amount, snapshot.asset),
          mono: true,
        },
        {
          label: 'Network fee',
          value: amountText(snapshot.fee, snapshot.asset),
          mono: true,
        },
        {
          ...WITHDRAWAL_TOTAL[snapshot.status],
          value: amountText(total, snapshot.asset),
          mono: true,
        },
        { label: 'Network', value: network },
        { label: 'Destination', value: snapshot.destination, mono: true },
        ...(snapshot.valuedAtUsd !== null
          ? [
              {
                label: 'Value at the time',
                // Not trimmed, unlike the crypto amounts above: the second
                // decimal on a dollar figure is a convention people read as
                // cents, and `$2539.3` looks like a number somebody mistyped.
                value: `$${snapshot.valuedAtUsd.toDecimalString()}`,
                mono: true,
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

/**
 * What a withdrawal's total line says, by what happened to the money.
 *
 * ── Changed from the approved copy, because it was false ──────────────────────
 * The line used to read "Total debited" whatever the status. True of an approval;
 * false of a request still waiting, where the total is held and nothing is debited,
 * and false of a rejection, where the hold was released and nothing was ever taken.
 * It was rarely seen while receipts were sent by hand. Now every request and every
 * decision is emailed, and a document telling a refused customer that their money
 * was taken is the one they would forward to a lawyer.
 */
const WITHDRAWAL_TOTAL = {
  approved: {
    label: 'Total debited',
    note: 'Amount plus fee, held on your account from the moment you asked.',
  },
  pending: {
    label: 'Total on hold',
    note: 'Amount plus fee, held on your account until the request is decided.',
  },
  rejected: {
    label: 'Total released',
    note: 'Amount plus fee, returned to your available balance. Nothing was debited.',
  },
} as const satisfies Record<ReceiptDto['status'], { label: string; note: string }>;

/**
 * How one amount reads on the document.
 *
 * ── The padding goes ──────────────────────────────────────────────────────────
 * ETH is stored at eighteen decimal places, so every figure arrives as
 * `1.000000000000000000` and a four-row itemisation becomes a wall a reader has
 * to count zeros in to compare two lines. The padding carries no information:
 * dropping it removes characters and changes no value, which is why it happens
 * here and not through a rounding formatter.
 *
 * ── Six is the target, not a cut ──────────────────────────────────────────────
 * Trimming lands every amount inside six decimals for every asset a person
 * actually transacts in whole-ish units. A figure that genuinely carries more —
 * bitcoin to the satoshi is eight, and `0.01147491 BTC` needs all of them —
 * prints in full instead of being cut to fit, because a receipt that rounds
 * states a number the ledger does not hold, and the digits it dropped are the
 * ones a dispute is about.
 */
function amountText(amount: Money, asset: string): string {
  return `${amount.toTrimmedString()} ${asset}`;
}

/**
 * The asset's name, falling back to its code.
 *
 * A record outlives its catalogue entry — an asset the platform stops custodying
 * still has receipts sitting in inboxes — and a document headed "undefined
 * Withdrawal" because a row was retired is worse than one headed "XMR Withdrawal".
 */
function nameForAsset(deps: LedgerDependencies, code: string): string {
  return deps.assets.find(code)?.name ?? code;
}

/** Likewise: an unrecognised network id prints as itself rather than vanishing. */
function labelForNetwork(deps: LedgerDependencies, code: string, network: string): string {
  const found = deps.assets.find(code)?.networks.find((entry) => entry.id === network);
  return found?.label ?? network;
}
