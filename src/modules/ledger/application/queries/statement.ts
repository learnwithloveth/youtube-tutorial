import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import { userOwner } from '../../domain/account';
import type { TransferKind } from '../../domain/transfer';
import type { LedgerDependencies } from '../ports';

/**
 * One customer's statement: every movement on their accounts, newest first.
 *
 * ── Read from the entries, not reconstructed ───────────────────────────────────
 * The entries *are* the record; the balance is a materialised view of them. A
 * statement assembled from anything else would be a second opinion about what
 * happened, and the two would eventually disagree.
 *
 * ── There is no dollar column, deliberately ────────────────────────────────────
 * A statement line is a historical fact, and a dollar value for it needs the price
 * *at the time*, which this system does not store on an entry. The two tempting
 * shortcuts are both wrong:
 *
 *  - Today's price × a historical quantity is not what that movement was worth. On
 *    a volatile asset it can be out by a factor, and it changes every time the page
 *    is loaded, which makes a statement that will not reconcile with itself.
 *  - Omitting the caveat and showing it anyway is the same thing with the evidence
 *    removed.
 *
 * So the statement shows the quantity, which is the fact, and the asset. Adding a
 * value column means storing the valuation on the entry when it is posted — the
 * way `withdrawals.valued_at_usd` already does — and that is the right follow-up
 * rather than a render-time multiplication.
 */

export interface StatementLineDto {
  readonly id: string;
  readonly transferId: string;
  readonly kind: TransferKind;
  /** What caused it: a transaction hash, a withdrawal id, a ticket reference. */
  readonly reference: string;
  readonly asset: string;
  /** Signed exact decimal string: negative left the account. */
  readonly delta: string;
  /** Which way the money went, so the UI does not have to parse a minus sign. */
  readonly direction: 'in' | 'out';
  readonly occurredAt: string;
}

export interface StatementDto {
  readonly lines: readonly StatementLineDto[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly degraded: boolean;
}

export interface StatementOptions {
  readonly asset?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export async function getStatement(
  deps: LedgerDependencies,
  userId: UserId,
  options: StatementOptions = {},
): Promise<StatementDto> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);
  const owner = userOwner(userId);

  // `allSettled`, not `all`: the realistic failure is an unreachable database, in
  // which case both reject — and `Promise.all` would leave the second rejection
  // unattached, which Node terminates the process for by default.
  const [lines, total] = await Promise.allSettled([
    deps.accounts.listEntries({ owner, asset: options.asset, limit, offset }),
    deps.accounts.countEntries(owner, options.asset),
  ]);

  if (lines.status === 'rejected') {
    logger.error({ event: 'statement_read_failed', module: 'ledger', userId }, lines.reason);
    return { lines: [], total: 0, limit, offset, degraded: true };
  }

  return {
    lines: lines.value.map((entry) => ({
      id: entry.id,
      transferId: entry.transferId,
      kind: entry.kind,
      reference: entry.reference,
      asset: entry.delta.currency,
      delta: entry.delta.toDecimalString(),
      direction: entry.delta.isNegative ? 'out' : 'in',
      occurredAt: entry.occurredAt.toISOString(),
    })),
    // Falls back to what is on screen rather than to zero: "showing 25 of 0" reads
    // as a bug, and the count only ever drives a pager.
    total: total.status === 'fulfilled' ? total.value : lines.value.length,
    limit,
    offset,
    degraded: false,
  };
}
