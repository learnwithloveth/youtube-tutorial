import { logger } from '@/platform/observability/logger';
import { Money } from '@/shared/kernel';

import type { WithdrawalDto } from '../dto';
import type { LedgerDependencies } from '../ports';
import { toWithdrawalDto } from './wallet';

/**
 * The operator queue: withdrawals waiting on a decision.
 *
 * Oldest first, because the queue is worked from the top and the thing a customer
 * notices is how long they waited — not how large the request was. Sorting by value
 * would leave small withdrawals sitting for days, which is the behaviour that
 * generates support tickets.
 */

export interface ApprovalQueueDto {
  readonly withdrawals: readonly WithdrawalDto[];
  /** Total value awaiting a decision, or null when something could not be valued. */
  readonly heldValueUsd: string | null;
  /**
   * How many of them the feed could not value.
   *
   * Replaces `needingDualControl`. No withdrawal needs a second signature any
   * more — one operator releases any amount — so that count was zero on every
   * render. This one explains why `heldValueUsd` goes null.
   */
  readonly unpriced: number;
  readonly degraded: boolean;
}

const EMPTY: ApprovalQueueDto = {
  withdrawals: [],
  heldValueUsd: null,
  unpriced: 0,
  degraded: true,
};

export async function listPendingApprovals(
  deps: LedgerDependencies,
  limit = 100,
): Promise<ApprovalQueueDto> {
  try {
    const pending = await deps.withdrawals.listPending(limit);
    const withdrawals = pending.map(toWithdrawalDto);

    const unpriced = withdrawals.filter((withdrawal) => withdrawal.valueUsd === null);

    return {
      withdrawals,
      // Same all-or-nothing rule the wallet total follows: a sum that silently omits
      // an unvalued request understates what is actually held, and an operator
      // reading "value awaiting approval" would be reading a number that is wrong
      // by an unknown amount.
      heldValueUsd: unpriced.length > 0
        ? null
        : withdrawals
            .reduce(
              (sum, withdrawal) =>
                sum.add(Money.fromDecimalString(withdrawal.valueUsd ?? '0', 'USD', 2)),
              Money.zero('USD', 2),
            )
            .toDecimalString(),
      unpriced: unpriced.length,
      degraded: false,
    };
  } catch (error) {
    logger.error({ event: 'approval_queue_read_failed', module: 'ledger' }, error);
    return EMPTY;
  }
}
