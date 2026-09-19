import { describe, expect, it } from 'vitest';

import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { DepositClaim } from '../../domain/deposit-claim';
import { Withdrawal } from '../../domain/withdrawal';
import type {
  DepositClaimRepository,
  FeedPageQuery,
  LedgerDependencies,
  WithdrawalRepository,
} from '../ports';
import { decodeCursor, listTransactions } from '../queries/transactions';

/**
 * The transaction feed, with two in-memory sources.
 *
 * ── What is actually being tested ──────────────────────────────────────────────
 * Not that rows come back — that a *cursor* over two independently-paged sources
 * loses nothing and repeats nothing. That is the property the whole design turns
 * on and the one that fails silently: a feed that drops one transaction between
 * page one and page two looks completely normal, and the missing row is a deposit
 * somebody is waiting on.
 *
 * So the tests page all the way to the end and assert on the *set*, not on the
 * first screenful.
 */

const USER = 'user-1' as UserId;
const OTHER = 'user-2' as UserId;

/** A fixed instant, so "newest first" is a fact rather than a race with the clock. */
const T0 = Date.parse('2026-03-01T12:00:00.000Z');

function at(minutesAgo: number): Date {
  return new Date(T0 - minutesAgo * 60_000);
}

function claim(id: string, submittedAt: Date, userId: UserId = USER): DepositClaim {
  return DepositClaim.rehydrate({
    id,
    userId,
    asset: 'BTC',
    network: 'bitcoin',
    claimedAmount: Money.fromDecimalString('0.5', 'BTC', 8),
    creditedAmount: null,
    reference: `hash-${id}`,
    proofId: `proof-${id}`,
    status: 'pending',
    submittedAt,
    confirmingAt: null,
    confirmingBy: null,
    confirmingNote: null,
    decidedAt: null,
    decidedBy: null,
    reason: null,
    transferId: null,
  });
}

function withdrawal(id: string, requestedAt: Date, userId: UserId = USER): Withdrawal {
  return Withdrawal.rehydrate({
    id,
    userId,
    asset: 'BTC',
    amount: Money.fromDecimalString('0.25', 'BTC', 8),
    fee: Money.fromDecimalString('0.0001', 'BTC', 8),
    network: 'bitcoin',
    destination: `bc1-${id}`,
    valuedAtUsd: Money.fromDecimalString('25000.00', 'USD', 2),
    status: 'pending',
    requestedAt,
    approvals: [],
    decidedAt: null,
    decidedBy: null,
    reason: null,
  });
}

/**
 * The keyset filter, written out rather than imported from the repository.
 *
 * A fake that shared the production `WHERE` could not disagree with it, and that
 * disagreement is exactly what these tests exist to catch.
 */
function page<T extends { id: string; userId: UserId; status: string }>(
  rows: readonly T[],
  when: (row: T) => Date,
  query: FeedPageQuery,
): T[] {
  return rows
    .filter((row) => {
      if (query.userId !== undefined && row.userId !== query.userId) return false;
      if (query.status !== undefined && row.status !== query.status) return false;
      if (query.before === undefined) return true;

      const time = when(row).getTime();
      const edge = query.before.occurredAt.getTime();
      return time < edge || (time === edge && row.id < query.before.id);
    })
    .sort((a, b) => {
      const delta = when(b).getTime() - when(a).getTime();
      return delta !== 0 ? delta : b.id.localeCompare(a.id);
    })
    .slice(0, query.limit);
}

function build(claims: DepositClaim[], withdrawals: Withdrawal[]) {
  const claimRepo = {
    async listPage(query: FeedPageQuery) {
      return page(claims, (c) => c.submittedAt, query);
    },
  } as unknown as DepositClaimRepository;

  const withdrawalRepo = {
    async listPage(query: FeedPageQuery) {
      return page(withdrawals, (w) => w.requestedAt, query);
    },
  } as unknown as WithdrawalRepository;

  return { claims: claimRepo, withdrawals: withdrawalRepo } as unknown as LedgerDependencies;
}

/** Walks the whole feed, one page at a time, the way the console does. */
async function drain(deps: LedgerDependencies, limit: number) {
  const ids: string[] = [];
  let cursor: string | null = null;
  // A guard, not a policy: an off-by-one in the cursor turns this into a loop that
  // never ends, and a hanging test is a worse signal than a failing one.
  for (let guard = 0; guard < 100; guard += 1) {
    const result = await listTransactions(deps, { limit, cursor });
    ids.push(...result.transactions.map((transaction) => transaction.id));
    if (result.nextCursor === null) return ids;
    cursor = result.nextCursor;
  }
  throw new Error('feed did not terminate');
}

describe('transaction feed', () => {
  it('merges both sources into one newest-first order', async () => {
    const deps = build(
      [claim('c1', at(10)), claim('c2', at(30))],
      [withdrawal('w1', at(20)), withdrawal('w2', at(40))],
    );

    const result = await listTransactions(deps, { limit: 10 });

    expect(result.transactions.map((t) => t.id)).toEqual([
      'deposit:c1',
      'withdrawal:w1',
      'deposit:c2',
      'withdrawal:w2',
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('pages through everything exactly once, whatever the page size', async () => {
    const claims = Array.from({ length: 11 }, (_, i) => claim(`c${i}`, at(i * 2)));
    const withdrawals = Array.from({ length: 9 }, (_, i) => withdrawal(`w${i}`, at(i * 2 + 1)));
    const deps = build(claims, withdrawals);

    const everything = (await listTransactions(deps, { limit: 100 })).transactions.map(
      (t) => t.id,
    );
    expect(everything).toHaveLength(20);

    // The console asks for five, then twenty. Both have to produce the same feed as
    // one unbounded read, or scrolling shows something a single page would not.
    for (const size of [1, 2, 3, 5, 7, 20]) {
      const paged = await drain(deps, size);
      expect(paged, `page size ${size}`).toEqual(everything);
      expect(new Set(paged).size, `page size ${size} repeated a row`).toBe(paged.length);
    }
  });

  it('does not lose a row when two records share an instant', async () => {
    // The case the id tie-break exists for. All four land on the same millisecond,
    // so ordering by time alone would make the boundary between pages arbitrary —
    // and a row on the wrong side of it is never returned at all.
    const shared = at(5);
    const deps = build(
      [claim('c-a', shared), claim('c-b', shared)],
      [withdrawal('w-a', shared), withdrawal('w-b', shared)],
    );

    const paged = await drain(deps, 1);

    expect(paged).toHaveLength(4);
    expect(new Set(paged).size).toBe(4);
    expect(paged).toEqual((await listTransactions(deps, { limit: 10 })).transactions.map((t) => t.id));
  });

  it('restricts to one kind without disturbing the order', async () => {
    const deps = build(
      [claim('c1', at(10)), claim('c2', at(30))],
      [withdrawal('w1', at(20))],
    );

    const deposits = await listTransactions(deps, { limit: 10, kind: 'deposit' });
    expect(deposits.transactions.map((t) => t.id)).toEqual(['deposit:c1', 'deposit:c2']);

    const withdrawals = await listTransactions(deps, { limit: 10, kind: 'withdrawal' });
    expect(withdrawals.transactions.map((t) => t.id)).toEqual(['withdrawal:w1']);
  });

  it('restricts to one customer', async () => {
    const deps = build(
      [claim('c1', at(10)), claim('c2', at(20), OTHER)],
      [withdrawal('w1', at(30), OTHER)],
    );

    const mine = await listTransactions(deps, { limit: 10, userId: USER });
    expect(mine.transactions.map((t) => t.id)).toEqual(['deposit:c1']);
  });

  it('fails the page rather than returning half a feed', async () => {
    // One source down. Returning the other would look complete and silently omit
    // every withdrawal — and the cursor derived from it would skip the missing rows
    // for good, not just on this read.
    const deps = {
      claims: {
        async listPage() {
          throw new Error('database unreachable');
        },
      },
      withdrawals: {
        async listPage() {
          return [withdrawal('w1', at(1))];
        },
      },
    } as unknown as LedgerDependencies;

    const result = await listTransactions(deps, { limit: 10 });

    expect(result.degraded).toBe(true);
    expect(result.transactions).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('treats an unreadable cursor as the start of the feed', async () => {
    const deps = build([claim('c1', at(10))], []);

    for (const bad of ['', 'nonsense', '~c1', 'not-a-date~c1', '2026-03-01T12:00:00.000Z~']) {
      expect(decodeCursor(bad), bad).toBeUndefined();
    }

    const result = await listTransactions(deps, { limit: 10, cursor: 'nonsense' });
    expect(result.transactions.map((t) => t.id)).toEqual(['deposit:c1']);
  });

  it('carries the evidence a claim and a withdrawal each have', async () => {
    const deps = build([claim('c1', at(10))], [withdrawal('w1', at(20))]);

    const [deposit, payout] = (await listTransactions(deps, { limit: 10 })).transactions;

    expect(deposit).toMatchObject({
      kind: 'deposit',
      recordId: 'c1',
      direction: 'in',
      hasProof: true,
      reference: 'hash-c1',
      destination: null,
      // Amounts cross as exact decimal strings, never numbers.
      amount: '0.50000000',
    });

    expect(payout).toMatchObject({
      kind: 'withdrawal',
      recordId: 'w1',
      direction: 'out',
      hasProof: false,
      // In full: the operator deciding this payment has to be able to read it.
      destination: 'bc1-w1',
      fee: '0.00010000',
      valueUsd: '25000.00',
    });
  });
});
