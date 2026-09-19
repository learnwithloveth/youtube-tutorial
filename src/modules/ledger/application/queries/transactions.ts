import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { DepositClaim } from '../../domain/deposit-claim';
import { approvalsRequired, limitsFor, tierFor } from '../../domain/limits';
import type { Withdrawal } from '../../domain/withdrawal';
import type { FeedCursor, FeedPageQuery, LedgerDependencies } from '../ports';

/**
 * Every transaction on the platform, newest first.
 *
 * ── What counts as a transaction here ──────────────────────────────────────────
 * A deposit claim or a withdrawal request — the two records a customer creates
 * that move, or ask to move, money. Not `entries`, even though those are the
 * ledger's record of truth.
 *
 * That looks backwards and is deliberate. An entry is a *consequence*: it exists
 * only after an operator approves, so a feed of entries cannot show the pending
 * queue or anything that was refused — which is most of what a console is opened
 * to look at. Worse, it double-counts: an approved deposit is a claim *and* the
 * transfer it produced, and a reader would see the same money twice with no way
 * to tell. So the feed is of the requests, each carrying the id of the transfer it
 * produced, and the statement remains the entry-level view for one account.
 *
 * The gap that leaves: a transfer posted with no request behind it — an operator
 * recording an arrival through `recordDeposit`, or a correcting adjustment — does
 * not appear. Neither is reachable from any interface today, and when one is, it
 * becomes a third source merged the same way as the other two rather than a
 * rewrite of this.
 *
 * ── Merged in the application, not in SQL ──────────────────────────────────────
 * Two tables with different columns, so a `UNION ALL` would mean projecting both
 * into a common row shape in SQL and re-splitting it afterwards — the domain types
 * would have to be rebuilt from a flattened tuple, and the mapping would live in a
 * query string where nothing type-checks it.
 *
 * Reading the newest `limit` from each source and merging is exactly equivalent,
 * because any row a source did *not* return is older than that source's last one,
 * and only `limit` rows are kept from a pool of at most twice that. The cost is
 * one extra page-worth of rows read per request, which is bounded and small.
 */

export type TransactionKind = 'deposit' | 'withdrawal';
/**
 * A row's state in the console's feed.
 *
 * `confirming` reaches this from a deposit claim and never from a withdrawal:
 * there is no chain to wait on before a decision to pay out, only after one, and
 * the platform's payout path ends at `payable` rather than broadcasting anything.
 * So the union is wider than either source alone, which is what a feed over two
 * tables is.
 */
export type TransactionStatus = 'pending' | 'confirming' | 'approved' | 'rejected';

export interface TransactionDto {
  /**
   * Unique across kinds.
   *
   * Prefixed because the two source tables have independent id spaces: a claim and
   * a withdrawal could hold the same string, and a React key or a selection that
   * collided would render one row's detail under another's.
   */
  readonly id: string;
  readonly kind: TransactionKind;
  /** The row's own id — what the proof route and the decision forms take. */
  readonly recordId: string;
  readonly userId: string;

  readonly asset: string;
  readonly network: string;
  /** What the customer claimed or requested. Exact decimal string, never a number. */
  readonly amount: string;
  /**
   * What actually moved.
   *
   * Null while pending, and null on a rejection — because nothing moved. On an
   * approved deposit it is what the operator verified arrived, which is kept apart
   * from `amount` on purpose: the gap between the two is what a dispute is about.
   */
  readonly settledAmount: string | null;
  /** Withdrawals only; deposits are not charged one. */
  readonly fee: string | null;
  /**
   * USD value frozen at request time, or null when the asset could not be priced.
   *
   * Never recomputed for display. The daily limit was checked against this number,
   * so the record of the decision has to carry the number the decision was made on.
   */
  readonly valueUsd: string | null;
  /** Which way the money went, so a reader does not have to infer it from the kind. */
  readonly direction: 'in' | 'out';

  /** Withdrawals: the payout address, in full. The console masks it for display. */
  readonly destination: string | null;
  /** Deposits: the customer's transaction hash or bank reference. */
  readonly reference: string | null;

  readonly status: TransactionStatus;
  /** Submitted (deposit) or requested (withdrawal). */
  readonly occurredAt: string;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly reason: string | null;
  /**
   * What an operator said while a deposit waits on the chain.
   *
   * Never a refusal — that is `reason`, and the two are separate fields on the
   * record for exactly this reason: a progress note rendered as a rejection would
   * have the customer's wallet explain something that did not happen. Null on a
   * withdrawal, which has no chain to wait on before a decision.
   */
  readonly confirmingNote: string | null;

  /** Deposits: whether a screenshot was filed. Always true today — a claim cannot
   *  be constructed without one — but the console should not assume that. */
  readonly hasProof: boolean;

  readonly approvalsHeld: number;
  readonly approvalsRequired: number;
  /** The balanced transfer this produced, once there is one. */
  readonly transferId: string | null;
}

export interface TransactionPageDto {
  readonly transactions: readonly TransactionDto[];
  /** Opaque. Null when this page is the end of the feed. */
  readonly nextCursor: string | null;
  /** True when the read failed. An empty feed and an unreachable database differ. */
  readonly degraded: boolean;
}

export interface TransactionFeedOptions {
  readonly limit?: number | undefined;
  readonly cursor?: string | null | undefined;
  readonly kind?: TransactionKind | 'all' | undefined;
  readonly status?: TransactionStatus | 'all' | undefined;
  readonly userId?: UserId | undefined;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * The two halves of a cursor, separated.
 *
 * A character that cannot occur in an ISO-8601 instant, so the split is on the
 * *first* occurrence and an id containing one would still round-trip.
 */
const CURSOR_SEPARATOR = '~';

export function encodeCursor(cursor: FeedCursor): string {
  return `${cursor.occurredAt.toISOString()}${CURSOR_SEPARATOR}${cursor.id}`;
}

/**
 * Reads a cursor, or `undefined` for anything unusable.
 *
 * Malformed input restarts the feed from the newest row rather than raising. A
 * cursor is a position, not an assertion of authority — the only thing a tampered
 * one can do is show the caller rows they were already entitled to see, in the
 * wrong place. Refusing the request would turn a stale browser tab into an error
 * screen, which is a worse trade for a console.
 */
export function decodeCursor(raw: string | null | undefined): FeedCursor | undefined {
  if (raw === null || raw === undefined || raw.length === 0) return undefined;

  const split = raw.indexOf(CURSOR_SEPARATOR);
  if (split <= 0) return undefined;

  const occurredAt = new Date(raw.slice(0, split));
  const id = raw.slice(split + 1);
  if (Number.isNaN(occurredAt.getTime()) || id.length === 0) return undefined;

  return { occurredAt, id };
}

export async function listTransactions(
  deps: LedgerDependencies,
  options: TransactionFeedOptions = {},
): Promise<TransactionPageDto> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const kind = options.kind ?? 'all';

  const query: FeedPageQuery = {
    limit,
    before: decodeCursor(options.cursor),
    userId: options.userId,
    status: options.status === 'all' ? undefined : options.status,
  };

  // `allSettled`, not `all`: the realistic failure is an unreachable database, in
  // which case both reject — and `Promise.all` leaves the second rejection
  // unattached, which Node terminates the process for by default.
  const [claims, withdrawals] = await Promise.allSettled([
    kind === 'withdrawal' ? Promise.resolve<DepositClaim[]>([]) : deps.claims.listPage(query),
    kind === 'deposit' ? Promise.resolve<Withdrawal[]>([]) : deps.withdrawals.listPage(query),
  ]);

  // Either source failing fails the page. Returning the half that worked would
  // produce a feed that looks complete and silently omits every withdrawal, and
  // the cursor derived from it would skip the missing rows permanently rather than
  // on this read alone.
  if (claims.status === 'rejected' || withdrawals.status === 'rejected') {
    logger.error(
      { event: 'transaction_feed_read_failed', module: 'ledger' },
      claims.status === 'rejected' ? claims.reason : (withdrawals as PromiseRejectedResult).reason,
    );
    return { transactions: [], nextCursor: null, degraded: true };
  }

  const merged = [
    ...claims.value.map(toDepositTransaction),
    ...withdrawals.value.map(toWithdrawalTransaction),
  ]
    .sort(newestFirst)
    .slice(0, limit);

  // A short page means both sources ran out, because each was asked for `limit` and
  // returned fewer. A full one means there is at least one more row somewhere — or
  // that the feed ended exactly on the boundary, which costs one empty request.
  const last = merged.length === limit ? merged[merged.length - 1] : undefined;

  return {
    transactions: merged,
    nextCursor:
      last === undefined
        ? null
        : encodeCursor({ occurredAt: new Date(last.occurredAt), id: last.recordId }),
    degraded: false,
  };
}

/**
 * The same order the two queries used, applied to the merged result.
 *
 * It has to match exactly, including the id tie-break: if this sorted by time
 * alone, two records sharing a millisecond could merge in one order and be paged
 * past in another, and the row between them would never be returned.
 *
 * ISO-8601 instants compare lexicographically in chronological order — fixed
 * width, fixed zone — so there is nothing to parse here.
 */
function newestFirst(a: TransactionDto, b: TransactionDto): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
  if (a.recordId === b.recordId) return 0;
  return a.recordId < b.recordId ? 1 : -1;
}

function toDepositTransaction(claim: DepositClaim): TransactionDto {
  const snapshot = claim.snapshot();

  return {
    id: `deposit:${snapshot.id}`,
    kind: 'deposit',
    recordId: snapshot.id,
    userId: snapshot.userId,
    asset: snapshot.asset,
    network: snapshot.network,
    amount: snapshot.claimedAmount.toDecimalString(),
    settledAmount: snapshot.creditedAmount?.toDecimalString() ?? null,
    fee: null,
    // A claim is never valued at submission: nothing is being checked against a
    // limit, so there is no number to freeze. Null says that, where a zero would
    // claim the deposit was worthless.
    valueUsd: null,
    direction: 'in',
    destination: null,
    reference: snapshot.reference,
    status: snapshot.status,
    occurredAt: snapshot.submittedAt.toISOString(),
    decidedAt: snapshot.decidedAt?.toISOString() ?? null,
    decidedBy: snapshot.decidedBy,
    reason: snapshot.reason,
    confirmingNote: snapshot.confirmingNote,
    hasProof: snapshot.proofId.length > 0,
    // A deposit is confirmed by one operator. Dual control exists to stop a single
    // compromised console account moving a large sum *out*; requiring a second
    // signature to credit money in protects nothing and delays a customer.
    approvalsHeld: snapshot.status === 'approved' ? 1 : 0,
    approvalsRequired: 1,
    transferId: snapshot.transferId,
  };
}

function toWithdrawalTransaction(withdrawal: Withdrawal): TransactionDto {
  const snapshot = withdrawal.snapshot();
  const settled = snapshot.status === 'approved' ? snapshot.amount.toDecimalString() : null;

  return {
    id: `withdrawal:${snapshot.id}`,
    kind: 'withdrawal',
    recordId: snapshot.id,
    userId: snapshot.userId,
    asset: snapshot.asset,
    network: snapshot.network,
    amount: snapshot.amount.toDecimalString(),
    settledAmount: settled,
    fee: snapshot.fee.toDecimalString(),
    valueUsd: snapshot.valuedAtUsd?.toDecimalString() ?? null,
    direction: 'out',
    // In full. Masking is a legibility choice the console makes at render time, not
    // a control — the operator deciding this payment has to be able to read it.
    destination: snapshot.destination,
    reference: null,
    status: snapshot.status,
    occurredAt: snapshot.requestedAt.toISOString(),
    decidedAt: snapshot.decidedAt?.toISOString() ?? null,
    decidedBy: snapshot.decidedBy,
    reason: snapshot.reason,
    // Null, always: a withdrawal waits on an operator and then on a payout run,
    // never on a chain before the decision.
    confirmingNote: null,
    hasProof: false,
    approvalsHeld: snapshot.approvals.length,
    approvalsRequired: approvalsRequired(snapshot.valuedAtUsd, limitsFor(tierFor())),
    // An approved withdrawal does post a transfer, but the withdrawal row does not
    // record which one — the link runs the other way, in the transfer's reference.
    // Null here is the honest answer rather than a second query per row; giving the
    // withdrawal a `transfer_id` column is the fix, and it is a migration.
    transferId: null,
  };
}
