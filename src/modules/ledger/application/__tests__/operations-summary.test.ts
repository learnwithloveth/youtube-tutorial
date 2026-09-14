import { describe, expect, it } from 'vitest';

import { fixedClock, Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { Withdrawal } from '../../domain/withdrawal';
import type {
  DecisionTally,
  DepositClaimRepository,
  LedgerDependencies,
  WithdrawalRepository,
} from '../ports';
import { getOperationsSummary } from '../queries/operations-summary';

/**
 * The command centre's ledger numbers.
 *
 * ── What is actually being tested ──────────────────────────────────────────────
 * Not that counts come back. That the *chart series* is honest, and that a partial
 * failure says so.
 *
 * A chart handed only the days that had rows draws a quiet week and a busy one at
 * the same spacing, which turns an absence into a trend — and it does that without
 * looking broken, which is why it needs a test rather than a glance.
 */

const NOW = new Date('2026-09-14T09:30:00.000Z');
const USER = 'user-1' as UserId;

function withdrawal(id: string, valuedAtUsd: Money | null): Withdrawal {
  return Withdrawal.rehydrate({
    id,
    userId: USER,
    asset: 'BTC',
    amount: Money.fromDecimalString('0.25', 'BTC', 8),
    fee: Money.fromDecimalString('0.0001', 'BTC', 8),
    network: 'bitcoin',
    destination: `bc1-${id}`,
    valuedAtUsd,
    status: 'pending',
    requestedAt: new Date(NOW.getTime() - 3_600_000),
    approvals: [],
    decidedAt: null,
    decidedBy: null,
    reason: null,
  });
}

function build(overrides: {
  pending?: Withdrawal[];
  withdrawalDays?: DecisionTally[];
  claimDays?: DecisionTally[];
  claimCounts?: { status: 'pending' | 'approved' | 'rejected'; total: number }[];
  failPending?: boolean;
  failClaimCounts?: boolean;
}): LedgerDependencies {
  const refuse = async (): Promise<never> => {
    throw new Error('connection refused');
  };

  return {
    clock: fixedClock(NOW),
    withdrawals: {
      listPending: overrides.failPending
        ? refuse
        : async () => overrides.pending ?? [],
      tallyDecisionsByDay: async () => overrides.withdrawalDays ?? [],
      listRecentlyDecided: async () => [],
    } as unknown as WithdrawalRepository,
    claims: {
      countByStatus: overrides.failClaimCounts
        ? refuse
        : async () => overrides.claimCounts ?? [],
      tallyDecisionsByDay: async () => overrides.claimDays ?? [],
      listRecentlyDecided: async () => [],
    } as unknown as DepositClaimRepository,
  } as unknown as LedgerDependencies;
}

describe('operations summary', () => {
  it('returns one bucket per day in the window, zeros included', async () => {
    const summary = await getOperationsSummary(build({}), { days: 7 });

    expect(summary.decisionsByDay).toHaveLength(7);
    expect(summary.decisionsByDay.map((day) => day.day)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ]);
    expect(summary.decisionsByDay.every((day) => day.approved === 0 && day.rejected === 0)).toBe(
      true,
    );
  });

  it('adds both queues into the same day', async () => {
    const summary = await getOperationsSummary(
      build({
        withdrawalDays: [{ day: '2026-09-12', approved: 2, rejected: 1 }],
        claimDays: [
          { day: '2026-09-12', approved: 3, rejected: 0 },
          { day: '2026-09-14', approved: 1, rejected: 0 },
        ],
      }),
      { days: 7 },
    );

    const byDay = new Map(summary.decisionsByDay.map((day) => [day.day, day]));
    expect(byDay.get('2026-09-12')).toEqual({ day: '2026-09-12', approved: 5, rejected: 1 });
    expect(byDay.get('2026-09-14')).toEqual({ day: '2026-09-14', approved: 1, rejected: 0 });
    // Untouched days stay in the series rather than vanishing from it.
    expect(byDay.get('2026-09-13')).toEqual({ day: '2026-09-13', approved: 0, rejected: 0 });
  });

  it('refuses to total held value when a request could not be priced', async () => {
    const priced = await getOperationsSummary(
      build({
        pending: [
          withdrawal('w1', Money.fromDecimalString('25000.00', 'USD', 2)),
          withdrawal('w2', Money.fromDecimalString('1000.50', 'USD', 2)),
        ],
      }),
    );
    expect(priced.heldValueUsd).toBe('26000.50');
    expect(priced.pending.withdrawals).toBe(2);

    // One unpriced request makes the sum wrong by an unknown amount. Null says so;
    // summing what we can would understate the holding and never admit it.
    const partial = await getOperationsSummary(
      build({
        pending: [withdrawal('w1', Money.fromDecimalString('25000.00', 'USD', 2)), withdrawal('w2', null)],
      }),
    );
    expect(partial.heldValueUsd).toBeNull();
    expect(partial.pending.withdrawals).toBe(2);
  });

  it('counts pending deposits from the claim tallies', async () => {
    const summary = await getOperationsSummary(
      build({
        claimCounts: [
          { status: 'pending', total: 4 },
          { status: 'approved', total: 11 },
        ],
      }),
    );

    expect(summary.pending.deposits).toBe(4);
    expect(summary.degraded).toBe(false);
  });

  it('reports a partial read as degraded rather than as a zero', async () => {
    // A failed claim count is not "no deposits waiting". The page has to be able
    // to tell the difference, or an operator reads an outage as an empty queue.
    const summary = await getOperationsSummary(build({ failClaimCounts: true }));

    expect(summary.degraded).toBe(true);
    expect(summary.pending.deposits).toBe(0);
  });

  it('gives up entirely when the pending queue itself cannot be read', async () => {
    // Every headline figure on the screen derives from that list, so a page built
    // without it would be all zeros with no indication they were not measured.
    const summary = await getOperationsSummary(build({ failPending: true }));

    expect(summary.degraded).toBe(true);
    expect(summary.heldValueUsd).toBeNull();
    expect(summary.decisionsByDay).toEqual([]);
  });
});
