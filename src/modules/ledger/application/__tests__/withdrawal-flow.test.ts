import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock, Money } from '@/shared/kernel';
import { sequentialIdGenerator, type UserId } from '@/shared/kernel/ids';

import {
  accountIdFor,
  LedgerAccount,
  platformOwner,
  userOwner,
  type AccountId,
  type AccountOwner,
} from '../../domain/account';
import type { LedgerAsset } from '../../domain/asset';
import type { Transfer } from '../../domain/transfer';
import type { Withdrawal, WithdrawalStatus } from '../../domain/withdrawal';
import { CatalogueAssetRegistry } from '../../infrastructure/catalogue/assets';
import type { DepositClaim } from '../../domain/deposit-claim';
import type { ProofContentType } from '../../domain/proof-image';
import type {
  DepositClaimRepository,
  FeedPageQuery,
  LedgerDependencies,
  LedgerRepository,
  PriceOracle,
  ProofStorage,
  WithdrawalRepository,
} from '../ports';
import { createDecideWithdrawal } from '../use-cases/decide-withdrawal';
import { createDecideDepositClaim } from '../use-cases/decide-deposit-claim';
import { createRecordDeposit } from '../use-cases/record-deposit';
import { createSubmitDepositClaim } from '../use-cases/submit-deposit-claim';
import { createRequestWithdrawal } from '../use-cases/request-withdrawal';

/**
 * The whole money path, with no database and no price feed.
 *
 * The point of the ports pointing the way they do: every adapter below is a fake
 * built in this file, the clock is fixed, and a failure always means a rule was
 * broken rather than that a service was down.
 *
 * The assertion that matters most is `expectBooksBalance` — after every scenario,
 * every posted entry across every account sums to zero per asset. That is the
 * property the ledger exists to guarantee, and it is checked against the entries
 * actually written rather than against the code that wrote them.
 */

const NOW = new Date('2026-09-14T12:00:00.000Z');
const ALICE = '11111111-1111-4111-8111-111111111111' as UserId;
const BOB = '22222222-2222-4222-8222-222222222222' as UserId;
const CAROL = '33333333-3333-4333-8333-333333333333' as UserId;

const BTC_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

class FakeLedger implements LedgerRepository {
  readonly store = new Map<AccountId, LedgerAccount>();
  readonly posted: Transfer[] = [];

  async findOrOpen(owner: AccountOwner, asset: LedgerAsset): Promise<LedgerAccount> {
    const id = accountIdFor(owner, asset.code);
    const existing = this.store.get(id);
    if (existing !== undefined) return existing;

    const opened = LedgerAccount.open(owner, asset.code, asset.scale);
    this.store.set(id, opened);
    return opened;
  }
  async find(id: AccountId) {
    return this.store.get(id) ?? null;
  }
  async listForOwner(owner: AccountOwner) {
    const scope = owner.kind === 'user' ? `user:${owner.userId}:` : `platform:${owner.purpose}:`;
    return [...this.store.values()].filter((account) => account.id.startsWith(scope));
  }
  async post(transfer: Transfer, updated: readonly LedgerAccount[]) {
    this.posted.push(transfer);
    for (const account of updated) this.store.set(account.id, account);
  }
  async saveAccounts(updated: readonly LedgerAccount[]) {
    for (const account of updated) this.store.set(account.id, account);
  }
  private statement(owner: AccountOwner, asset?: string | undefined) {
    const scope = owner.kind === 'user' ? `user:${owner.userId}:` : `platform:${owner.purpose}:`;
    return this.posted
      .flatMap((transfer) =>
        transfer.entries
          .filter(
            (entry) =>
              entry.accountId.startsWith(scope) &&
              (!asset || entry.delta.currency === asset.toUpperCase()),
          )
          .map((entry, position) => ({
            id: `${transfer.id}:${position}`,
            transferId: transfer.id,
            kind: transfer.kind,
            reference: transfer.reference,
            accountId: entry.accountId,
            delta: entry.delta,
            occurredAt: transfer.occurredAt,
          })),
      )
      .reverse();
  }
  async listEntries(query: {
    owner: AccountOwner;
    asset?: string | undefined;
    limit: number;
    offset: number;
  }) {
    return this.statement(query.owner, query.asset).slice(
      query.offset,
      query.offset + query.limit,
    );
  }
  async countEntries(owner: AccountOwner, asset?: string | undefined) {
    return this.statement(owner, asset).length;
  }
}

/**
 * The in-memory equivalent of the repositories' keyset `WHERE`.
 *
 * Written out here rather than imported from the query it supports: a fake that
 * borrows the production filter cannot disagree with it, which is exactly the
 * disagreement a test of paging is meant to catch.
 */
function feedPage<T extends { id: string; userId: UserId; status: string }>(
  rows: readonly T[],
  at: (row: T) => Date,
  query: FeedPageQuery,
): T[] {
  return rows
    .filter((row) => {
      if (query.userId !== undefined && row.userId !== query.userId) return false;
      if (query.status !== undefined && row.status !== query.status) return false;
      if (query.before === undefined) return true;

      const time = at(row).getTime();
      const edge = query.before.occurredAt.getTime();
      return time < edge || (time === edge && row.id < query.before.id);
    })
    .sort((a, b) => {
      const delta = at(b).getTime() - at(a).getTime();
      return delta !== 0 ? delta : b.id.localeCompare(a.id);
    })
    .slice(0, query.limit);
}

class FakeWithdrawals implements WithdrawalRepository {
  readonly store = new Map<string, Withdrawal>();

  async save(withdrawal: Withdrawal) {
    this.store.set(withdrawal.id, withdrawal);
  }
  async find(id: string) {
    return this.store.get(id) ?? null;
  }
  async listForUser(userId: UserId, limit: number) {
    return [...this.store.values()].filter((w) => w.userId === userId).slice(0, limit);
  }
  async listPending(limit: number) {
    return [...this.store.values()].filter((w) => w.status === 'pending').slice(0, limit);
  }
  async listPage(query: FeedPageQuery) {
    return feedPage([...this.store.values()], (w) => w.requestedAt, query);
  }
  async usedSince(userId: UserId, since: Date) {
    return [...this.store.values()]
      .filter(
        (w) =>
          w.userId === userId && w.requestedAt >= since && w.status !== 'rejected',
      )
      .reduce(
        (sum, w) => sum.add(w.valuedAtUsd ?? Money.zero('USD', 2)),
        Money.zero('USD', 2),
      );
  }
  async countByStatus() {
    const counts = new Map<WithdrawalStatus, number>();
    for (const w of this.store.values()) {
      counts.set(w.status, (counts.get(w.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, total]) => ({ status, total }));
  }
}

class FakeClaims implements DepositClaimRepository {
  readonly store = new Map<string, DepositClaim>();

  async save(claim: DepositClaim) {
    this.store.set(claim.id, claim);
  }
  async find(id: string) {
    return this.store.get(id) ?? null;
  }
  async listForUser(userId: UserId, limit: number) {
    return [...this.store.values()].filter((c) => c.userId === userId).slice(0, limit);
  }
  async listPending(limit: number) {
    return [...this.store.values()].filter((c) => c.status === 'pending').slice(0, limit);
  }
  async listPage(query: FeedPageQuery) {
    return feedPage([...this.store.values()], (c) => c.submittedAt, query);
  }
}

class FakeProofs implements ProofStorage {
  readonly store = new Map<string, { bytes: Uint8Array; contentType: ProofContentType }>();
  private counter = 0;

  async put(bytes: Uint8Array, contentType: ProofContentType) {
    const id = `proof-${this.counter++}`;
    this.store.set(id, { bytes, contentType });
    return id;
  }
  async get(id: string) {
    return this.store.get(id) ?? null;
  }
  async remove(id: string) {
    this.store.delete(id);
  }
}

/** $100,000 a bitcoin, so the arithmetic in the assertions stays readable. */
const priceOracle: PriceOracle = {
  async valueInUsd(amount: Money) {
    if (amount.currency === 'USD') return amount.withScale(2);
    if (amount.currency !== 'BTC') return null;

    const units = amount.minorUnits; // scale 8
    return Money.of((units * 100_000n) / 10n ** 6n, 'USD', 2);
  },
};

function build(prices: PriceOracle = priceOracle) {
  const accounts = new FakeLedger();
  const withdrawals = new FakeWithdrawals();

  const claims = new FakeClaims();
  const proofs = new FakeProofs();

  const deps: LedgerDependencies = {
    accounts,
    withdrawals,
    claims,
    proofs,
    prices,
    assets: new CatalogueAssetRegistry(),
    ids: sequentialIdGenerator(),
    clock: fixedClock(NOW),
  };

  return {
    deps,
    accounts,
    withdrawals,
    claims,
    proofs,
    deposit: createRecordDeposit(deps),
    submitClaim: createSubmitDepositClaim(deps),
    decideClaim: createDecideDepositClaim(deps),
    request: createRequestWithdrawal(deps),
    decide: createDecideWithdrawal(deps),
  };
}

/**
 * Every entry ever posted sums to zero, per asset.
 *
 * The invariant the whole module exists for, checked against what was written
 * rather than against the code that wrote it.
 */
function expectBooksBalance(accounts: FakeLedger): void {
  const totals = new Map<string, Money>();

  for (const transfer of accounts.posted) {
    for (const entry of transfer.entries) {
      const asset = entry.delta.currency;
      const running = totals.get(asset);
      totals.set(asset, running === undefined ? entry.delta : running.add(entry.delta));
    }
  }

  for (const [asset, total] of totals) {
    expect(`${asset}:${total.toDecimalString()}`).toBe(
      `${asset}:${Money.zero(asset, total.scale).toDecimalString()}`,
    );
  }
}

describe('deposits', () => {
  it('credits the customer and debits custody', async () => {
    const ctx = build();

    const result = await ctx.deposit({
      userId: ALICE,
      asset: 'BTC',
      amount: '2.5',
      reference: '0xabc123',
      recordedBy: BOB,
    });

    expect(result.ok).toBe(true);

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    const custody = await ctx.accounts.find(accountIdFor(platformOwner('custody'), 'BTC'));

    expect(alice?.balance.toDecimalString()).toBe('2.50000000');
    // Negative by construction: its magnitude is what the platform owes customers.
    expect(custody?.balance.toDecimalString()).toBe('-2.50000000');
    expectBooksBalance(ctx.accounts);
  });

  /* A credit with no external reference is indistinguishable from money invented
     at a console. */
  it('refuses a deposit with no reference', async () => {
    const ctx = build();
    const result = await ctx.deposit({
      userId: ALICE,
      asset: 'BTC',
      amount: '1',
      reference: '  ',
      recordedBy: BOB,
    });

    expect(result.ok).toBe(false);
    expect(ctx.accounts.posted).toHaveLength(0);
  });
});

describe('requesting a withdrawal', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(async () => {
    ctx = build();
    await ctx.deposit({
      userId: ALICE,
      asset: 'BTC',
      amount: '1.0',
      reference: 'seed',
      recordedBy: BOB,
    });
  });

  it('holds the amount plus the fee without moving anything', async () => {
    const result = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '0.05',
    });

    expect(result.ok).toBe(true);

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    expect(alice?.balance.toDecimalString()).toBe('1.00000000');
    expect(alice?.held.toDecimalString()).toBe('0.05004000');
    expect(alice?.available.toDecimalString()).toBe('0.94996000');

    // One transfer so far — the deposit. A request moves nothing.
    expect(ctx.accounts.posted).toHaveLength(1);
  });

  it('refuses more than is available', async () => {
    const result = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '5.0',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('insufficient-funds');
  });

  /* The common real mistake is a correct address pasted for the wrong chain. */
  it('refuses an address that does not belong to the network', async () => {
    const result = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: '0x7Ae4d81C93bF2a09E5cB88016fD5Ea3c7d92b104',
      amount: '0.05',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('destination-invalid');
  });

  it('refuses below the minimum', async () => {
    const result = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '0.0001',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('amount-below-minimum');
  });

  /* The standard tier caps a day at $25,000; 0.3 BTC at $100k is $30,000. */
  it('refuses over the daily limit', async () => {
    const result = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '0.3',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('daily-limit-exceeded');
  });

  /* Pending withdrawals count against the day, or twenty requests inside a minute
     would each pass individually and sum past the cap. */
  it('counts pending requests against the daily limit', async () => {
    for (let i = 0; i < 2; i += 1) {
      const ok = await ctx.request({
        userId: ALICE,
        asset: 'BTC',
        network: 'bitcoin',
        destination: BTC_ADDRESS,
        amount: '0.1', // $10,000 each
      });
      expect(ok.ok).toBe(true);
    }

    const third = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '0.1',
    });

    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error.kind).toBe('daily-limit-exceeded');
  });

  /* An exchange that keeps paying out while it has lost sight of what things are
     worth is the one that discovers the problem afterwards. */
  it('refuses when the asset cannot be priced, rather than skipping the limit', async () => {
    const blind = build({ async valueInUsd() { return null; } });
    await blind.deposit({
      userId: ALICE,
      asset: 'BTC',
      amount: '1.0',
      reference: 'seed',
      recordedBy: BOB,
    });

    const result = await blind.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '0.05',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('valuation-unavailable');
  });
});

describe('deciding a withdrawal', () => {
  async function seeded(amount: string) {
    const ctx = build();
    await ctx.deposit({
      userId: ALICE,
      asset: 'BTC',
      amount: '1.0',
      reference: 'seed',
      recordedBy: BOB,
    });

    const requested = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount,
    });
    if (!requested.ok) throw new Error(`setup failed: ${requested.error.kind}`);

    return { ctx, id: requested.value.withdrawalId };
  }

  it('moves money to payable and fees on approval, and the books balance', async () => {
    const { ctx, id } = await seeded('0.05'); // $5,000 — one signature

    const result = await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('approved');

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    const payable = await ctx.accounts.find(accountIdFor(platformOwner('payable'), 'BTC'));
    const fees = await ctx.accounts.find(accountIdFor(platformOwner('fees'), 'BTC'));

    expect(alice?.balance.toDecimalString()).toBe('0.94996000');
    // The hold is consumed by the debit it was reserving for, not left behind.
    expect(alice?.held.toDecimalString()).toBe('0.00000000');
    expect(payable?.balance.toDecimalString()).toBe('0.05000000');
    expect(fees?.balance.toDecimalString()).toBe('0.00004000');

    expectBooksBalance(ctx.accounts);
  });

  it('releases the hold and moves nothing on rejection', async () => {
    const { ctx, id } = await seeded('0.05');

    const result = await ctx.decide({
      withdrawalId: id,
      operatorId: BOB,
      decision: 'reject',
      reason: 'Destination flagged',
    });

    expect(result.ok).toBe(true);

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    expect(alice?.balance.toDecimalString()).toBe('1.00000000');
    expect(alice?.held.toDecimalString()).toBe('0.00000000');

    // Only the deposit was ever posted: a rejection leaves no trace on the
    // customer's statement, because nothing happened.
    expect(ctx.accounts.posted).toHaveLength(1);
    expectBooksBalance(ctx.accounts);
  });

  it('refuses a rejection with no reason', async () => {
    const { ctx, id } = await seeded('0.05');

    const result = await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'reject' });
    expect(result.ok).toBe(false);
  });

  describe('dual control', () => {
    /* 0.15 BTC at $100k is $15,000 — over the $10,000 threshold. */
    it('holds the money until a second, different operator signs', async () => {
      const { ctx, id } = await seeded('0.15');

      const first = await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.value.status).toBe('pending');
        expect(first.value.approvalsHeld).toBe(1);
        expect(first.value.approvalsRequired).toBe(2);
      }

      // Nothing has moved yet, and the hold is untouched.
      const midway = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
      expect(midway?.held.toDecimalString()).toBe('0.15004000');
      expect(ctx.accounts.posted).toHaveLength(1);

      const second = await ctx.decide({
        withdrawalId: id,
        operatorId: CAROL,
        decision: 'approve',
      });
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.value.status).toBe('approved');

      expect(ctx.accounts.posted).toHaveLength(2);
      expectBooksBalance(ctx.accounts);
    });

    /* Otherwise dual control is one person clicking the same button twice. */
    it('refuses the same operator as the second signature', async () => {
      const { ctx, id } = await seeded('0.15');

      await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });
      const again = await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });

      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.error.kind).toBe('approval-refused');
      expect(ctx.accounts.posted).toHaveLength(1);
    });
  });

  it('refuses a second decision on something already decided', async () => {
    const { ctx, id } = await seeded('0.05');
    await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });

    const again = await ctx.decide({ withdrawalId: id, operatorId: CAROL, decision: 'approve' });

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.kind).toBe('withdrawal-already-decided');
  });
});

describe('deposit claims', () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function screenshot(): Uint8Array {
    const bytes = new Uint8Array(512);
    bytes.set(PNG, 0);
    return bytes;
  }

  function claim(overrides: Record<string, unknown> = {}) {
    return {
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '0.25',
      reference: '0xdeadbeefcafe',
      proof: screenshot(),
      ...overrides,
    } as Parameters<ReturnType<typeof createSubmitDepositClaim>>[0];
  }

  it('stores the proof and credits nothing', async () => {
    const ctx = build();

    const result = await ctx.submitClaim(claim());
    expect(result.ok).toBe(true);

    expect(ctx.proofs.store.size).toBe(1);
    // The whole point: a claim is evidence submitted, not money credited.
    expect(ctx.accounts.posted).toHaveLength(0);

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    expect(alice).toBeNull();
  });

  /* A claim with no proof is a request to be given money. */
  it('refuses a file that is not an image, whatever it is called', async () => {
    const ctx = build();
    const html = new TextEncoder().encode(`<html>${'x'.repeat(200)}</html>`);

    const result = await ctx.submitClaim(claim({ proof: html }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('proof-invalid');
    expect(ctx.proofs.store.size).toBe(0);
  });

  it('refuses a claim with no transaction reference', async () => {
    const ctx = build();
    const result = await ctx.submitClaim(claim({ reference: '   ' }));

    expect(result.ok).toBe(false);
    // Nothing stored: a rejected claim should not leave an orphan image behind.
    expect(ctx.proofs.store.size).toBe(0);
  });

  it('credits the balance on approval and the books balance', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim());
    if (!submitted.ok) throw new Error('setup failed');

    const decided = await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'approve',
    });

    expect(decided.ok).toBe(true);
    if (decided.ok) expect(decided.value.credited).toBe('0.25000000');

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    const custody = await ctx.accounts.find(accountIdFor(platformOwner('custody'), 'BTC'));

    expect(alice?.balance.toDecimalString()).toBe('0.25000000');
    expect(custody?.balance.toDecimalString()).toBe('-0.25000000');
    expectBooksBalance(ctx.accounts);
  });

  /* People mistype and networks take fees. The ledger credits what arrived, and
     both numbers are kept so a dispute can be read afterwards. */
  it('credits the amount the operator verified, not the amount claimed', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim({ amount: '0.5' }));
    if (!submitted.ok) throw new Error('setup failed');

    await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'approve',
      creditedAmount: '0.4998',
    });

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    expect(alice?.balance.toDecimalString()).toBe('0.49980000');

    const stored = await ctx.claims.find(submitted.value.claimId);
    // The claim survives intact beside the credit — that gap is what a dispute is.
    expect(stored?.claimedAmount.toDecimalString()).toBe('0.50000000');
    expect(stored?.creditedAmount?.toDecimalString()).toBe('0.49980000');
  });

  it('moves nothing on rejection and records why', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim());
    if (!submitted.ok) throw new Error('setup failed');

    const decided = await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'reject',
      reason: 'No matching transaction on chain',
    });

    expect(decided.ok).toBe(true);
    expect(ctx.accounts.posted).toHaveLength(0);

    const stored = await ctx.claims.find(submitted.value.claimId);
    expect(stored?.status).toBe('rejected');
    expect(stored?.reason).toBe('No matching transaction on chain');
  });

  it('refuses a rejection with no reason', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim());
    if (!submitted.ok) throw new Error('setup failed');

    const decided = await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'reject',
    });

    expect(decided.ok).toBe(false);
  });

  /* Crediting is the cheaper fraud — it needs no counterparty and only surfaces
     when custody is next reconciled. */
  it('refuses an operator approving their own deposit', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim());
    if (!submitted.ok) throw new Error('setup failed');

    const decided = await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: ALICE,
      decision: 'approve',
    });

    expect(decided.ok).toBe(false);
    if (!decided.ok) expect(decided.error.kind).toBe('approval-refused');
    expect(ctx.accounts.posted).toHaveLength(0);
  });

  it('refuses a second decision on a decided claim', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim());
    if (!submitted.ok) throw new Error('setup failed');

    await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'approve',
    });
    const again = await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: CAROL,
      decision: 'approve',
    });

    expect(again.ok).toBe(false);
  });
});
