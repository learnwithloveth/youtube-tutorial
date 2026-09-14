import { logger } from '@/platform/observability/logger';
import { Money } from '@/shared/kernel';

import type { DepositClaim } from '../../domain/deposit-claim';
import { approvalsRequired, limitsFor, tierFor } from '../../domain/limits';
import type { Withdrawal } from '../../domain/withdrawal';
import type { DecisionTally, LedgerDependencies } from '../ports';

/**
 * What the ledger can tell an operations console.
 *
 * ── Everything here is counted, nothing is estimated ───────────────────────────
 * The screen this feeds used to show a 24-hour trading volume, a verified-trader
 * count and six services with uptime percentages, all generated from a seeded
 * random number. They are gone rather than reimplemented, for the reason the
 * approvals queue lost its risk scores: a number on a console is read as a
 * measurement, and one that is actually a plausible-looking constant is worse
 * than a blank space, because a blank space cannot be acted on by mistake.
 *
 * What is left is smaller and true: what is waiting, what it is worth, what was
 * decided and by whom.
 *
 * ── Held value counts withdrawals only ─────────────────────────────────────────
 * A pending withdrawal reserves funds on a customer's account — that is money this
 * platform is holding and cannot spend. A pending deposit claim reserves nothing:
 * it is an assertion that money arrived, and until an operator confirms it, no
 * balance anywhere has changed. Adding the two would produce a number that is not
 * a quantity of anything.
 */

export type DecisionAction =
  | 'deposit.approved'
  | 'deposit.rejected'
  | 'withdrawal.approved'
  | 'withdrawal.rejected';

export interface DecisionDto {
  readonly id: string;
  readonly action: DecisionAction;
  readonly recordId: string;
  /** The customer the decision was about. */
  readonly userId: string;
  /** The operator who made it. Null on rows written before the column existed. */
  readonly operatorId: string | null;
  readonly asset: string;
  /** Exact decimal string. What was credited or paid, falling back to what was asked. */
  readonly amount: string;
  readonly reason: string | null;
  readonly decidedAt: string;
}

export interface OperationsSummaryDto {
  readonly pending: {
    readonly withdrawals: number;
    readonly deposits: number;
    /** Withdrawals large enough to need a second operator — see `approvalsRequired`. */
    readonly needingSecondSignature: number;
  };
  /**
   * Total value reserved against pending withdrawals, or null when any of them
   * could not be valued.
   *
   * All-or-nothing, the same rule the wallet total follows: a sum that quietly
   * omits an unvalued request is wrong by an unknown amount, and an operator
   * reading "value held" would have no way to tell.
   */
  readonly heldValueUsd: string | null;
  /** Oldest first, one entry per UTC day in the window, including empty ones. */
  readonly decisionsByDay: readonly DecisionTally[];
  readonly recentDecisions: readonly DecisionDto[];
  readonly degraded: boolean;
}

const DAY_MS = 86_400_000;
const DEFAULT_DECISION_DAYS = 7;
const DEFAULT_RECENT = 7;

const EMPTY: OperationsSummaryDto = {
  pending: { withdrawals: 0, deposits: 0, needingSecondSignature: 0 },
  heldValueUsd: null,
  decisionsByDay: [],
  recentDecisions: [],
  degraded: true,
};

export async function getOperationsSummary(
  deps: LedgerDependencies,
  options: { days?: number | undefined; recent?: number | undefined } = {},
): Promise<OperationsSummaryDto> {
  const days = Math.min(Math.max(options.days ?? DEFAULT_DECISION_DAYS, 1), 90);
  const recent = Math.min(Math.max(options.recent ?? DEFAULT_RECENT, 1), 50);

  const now = deps.clock.now();
  const since = startOfUtcDay(new Date(now.getTime() - (days - 1) * DAY_MS));

  // `allSettled`, not `all`: the realistic failure is an unreachable database, in
  // which case every one of these rejects — and `Promise.all` leaves the rest
  // unattached, which Node terminates the process for by default.
  const results = await Promise.allSettled([
    deps.withdrawals.listPending(200),
    deps.claims.countByStatus(),
    deps.withdrawals.tallyDecisionsByDay(since),
    deps.claims.tallyDecisionsByDay(since),
    deps.withdrawals.listRecentlyDecided(recent),
    deps.claims.listRecentlyDecided(recent),
  ]);

  const [pendingWithdrawals, claimCounts, withdrawalDays, claimDays, decidedW, decidedC] =
    results;

  // The pending queue is the one read this screen cannot render without: every
  // headline number on it is derived from that list. The rest degrade in place.
  if (pendingWithdrawals.status === 'rejected') {
    logger.error({ event: 'operations_summary_read_failed', module: 'ledger' }, pendingWithdrawals.reason);
    return EMPTY;
  }

  const limits = limitsFor(tierFor());
  const held = pendingWithdrawals.value;
  const unpriced = held.some((withdrawal) => withdrawal.valuedAtUsd === null);

  const decisions = [
    ...(decidedW.status === 'fulfilled' ? decidedW.value.map(toWithdrawalDecision) : []),
    ...(decidedC.status === 'fulfilled' ? decidedC.value.map(toDepositDecision) : []),
  ]
    .sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : 0))
    .slice(0, recent);

  return {
    pending: {
      withdrawals: held.length,
      deposits:
        claimCounts.status === 'fulfilled'
          ? (claimCounts.value.find((row) => row.status === 'pending')?.total ?? 0)
          : 0,
      needingSecondSignature: held.filter(
        (withdrawal) => approvalsRequired(withdrawal.valuedAtUsd, limits) > 1,
      ).length,
    },
    heldValueUsd: unpriced
      ? null
      : held
          .reduce(
            (sum, withdrawal) => sum.add(withdrawal.valuedAtUsd ?? Money.zero('USD', 2)),
            Money.zero('USD', 2),
          )
          .toDecimalString(),
    decisionsByDay: fillDays(
      since,
      days,
      merge(
        withdrawalDays.status === 'fulfilled' ? withdrawalDays.value : [],
        claimDays.status === 'fulfilled' ? claimDays.value : [],
      ),
    ),
    recentDecisions: decisions,
    degraded: results.some((result) => result.status === 'rejected'),
  };
}

/** Adds two tables' daily counts together. Both are keyed on the same UTC day. */
function merge(a: readonly DecisionTally[], b: readonly DecisionTally[]): Map<string, DecisionTally> {
  const byDay = new Map<string, { day: string; approved: number; rejected: number }>();
  for (const tally of [...a, ...b]) {
    const entry = byDay.get(tally.day) ?? { day: tally.day, approved: 0, rejected: 0 };
    entry.approved += tally.approved;
    entry.rejected += tally.rejected;
    byDay.set(tally.day, entry);
  }
  return byDay;
}

/**
 * One entry per day in the window, zeros included.
 *
 * A day with no decisions is a measurement, not a missing one — and a chart handed
 * only the days that had rows would draw a quiet week and a busy one at the same
 * spacing, which turns a gap into a trend.
 */
function fillDays(
  start: Date,
  span: number,
  counted: Map<string, DecisionTally>,
): DecisionTally[] {
  const days: DecisionTally[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
    days.push(counted.get(day) ?? { day, approved: 0, rejected: 0 });
  }
  return days;
}

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function toWithdrawalDecision(withdrawal: Withdrawal): DecisionDto {
  const snapshot = withdrawal.snapshot();
  return {
    id: `withdrawal:${snapshot.id}`,
    action: snapshot.status === 'approved' ? 'withdrawal.approved' : 'withdrawal.rejected',
    recordId: snapshot.id,
    userId: snapshot.userId,
    operatorId: snapshot.decidedBy,
    asset: snapshot.asset,
    amount: snapshot.amount.toDecimalString(),
    reason: snapshot.reason,
    // Only decided rows reach here — `listRecentlyDecided` filters on the column —
    // but the type allows null, so the fallback keeps the DTO's promise honest
    // rather than asserting non-null.
    decidedAt: (snapshot.decidedAt ?? snapshot.requestedAt).toISOString(),
  };
}

function toDepositDecision(claim: DepositClaim): DecisionDto {
  const snapshot = claim.snapshot();
  return {
    id: `deposit:${snapshot.id}`,
    action: snapshot.status === 'approved' ? 'deposit.approved' : 'deposit.rejected',
    recordId: snapshot.id,
    userId: snapshot.userId,
    operatorId: snapshot.decidedBy,
    asset: snapshot.asset,
    // What was credited, falling back to what was claimed on a rejection — where
    // nothing was credited, and the claim is the only figure the decision was about.
    amount: (snapshot.creditedAmount ?? snapshot.claimedAmount).toDecimalString(),
    reason: snapshot.reason,
    decidedAt: (snapshot.decidedAt ?? snapshot.submittedAt).toISOString(),
  };
}
