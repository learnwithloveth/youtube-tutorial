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
import type { DepositClaim, DepositClaimStatus } from '../../domain/deposit-claim';
import type { ProofContentType } from '../../domain/proof-image';
import type {
  CustomerDirectory,
  DecisionTally,
  DepositClaimRepository,
  FeedPageQuery,
  LedgerDependencies,
  LedgerRepository,
  PriceOracle,
  ProofStorage,
  ReceiptSender,
  WithdrawalRepository,
} from '../ports';
import { createDecideWithdrawal } from '../use-cases/decide-withdrawal';
import { createSendReceipt, createSendTransactionEmail } from '../use-cases/send-receipt';
import { createDecideDepositClaim } from '../use-cases/decide-deposit-claim';
import { createMarkDepositConfirming } from '../use-cases/mark-deposit-confirming';
import { createGrantDemoFunds } from '../use-cases/grant-demo-funds';
import { createSendDemoFundsEmail } from '../use-cases/send-demo-funds-email';
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
const TRON_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

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
            // Carried through, so a test can assert the chain a movement names.
            network: transfer.network,
            txHash: transfer.txHash,
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

/** The in-memory equivalent of `tallyDecisions`, over anything with a decision. */
function decisionsByDay(
  rows: readonly { status: string }[],
  decidedAt: (row: never) => Date | null,
  since: Date,
): DecisionTally[] {
  const byDay = new Map<string, { day: string; approved: number; rejected: number }>();
  for (const row of rows) {
    const at = decidedAt(row as never);
    if (at === null || at < since) continue;

    const day = at.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { day, approved: 0, rejected: 0 };
    if (row.status === 'approved') entry.approved += 1;
    else if (row.status === 'rejected') entry.rejected += 1;
    byDay.set(day, entry);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
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
  async tallyDecisionsByDay(since: Date) {
    return decisionsByDay([...this.store.values()], (w: Withdrawal) => w.decidedAt, since);
  }
  async listRecentlyDecided(limit: number) {
    return [...this.store.values()]
      .filter((w) => w.decidedAt !== null)
      .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
      .slice(0, limit);
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
    // Matches the real adapter: a confirming claim is undecided and stays in the
    // queue. A fake that dropped it would let a regression through where an
    // operator marks something as in progress and loses it.
    return [...this.store.values()].filter((c) => c.isUndecided).slice(0, limit);
  }
  async listPage(query: FeedPageQuery) {
    return feedPage([...this.store.values()], (c) => c.submittedAt, query);
  }
  async countByStatus() {
    const counts = new Map<DepositClaimStatus, number>();
    for (const claim of this.store.values()) {
      counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, total]) => ({ status, total }));
  }
  async tallyDecisionsByDay(since: Date) {
    return decisionsByDay([...this.store.values()], (c: DepositClaim) => c.decidedAt, since);
  }
  async listRecentlyDecided(limit: number) {
    return [...this.store.values()]
      .filter((c) => c.decidedAt !== null)
      .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
      .slice(0, limit);
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

/** Mail, captured rather than sent. `outbox` is what the assertions read. */
const SITE = 'Aurum Exchange';

/**
 * The harness.
 *
 * `overrides` is applied last and exists for the failure paths — a directory that
 * cannot resolve an address, a sender that refuses. Those are reported as values
 * rather than thrown, so there has to be a way to provoke them.
 */
function build(
  prices: PriceOracle = priceOracle,
  overrides: Partial<LedgerDependencies> = {},
) {
  const accounts = new FakeLedger();
  const withdrawals = new FakeWithdrawals();

  const claims = new FakeClaims();
  const proofs = new FakeProofs();

  const outbox: { to: string; subject: string; text: string; html: string }[] = [];
  const receipts: ReceiptSender = {
    async send(message) {
      outbox.push(message);
      return { sent: true };
    },
  };
  const directory: CustomerDirectory = {
    async emailFor(userId) {
      return `${userId.slice(0, 8)}@example.com`;
    },
  };

  const deps: LedgerDependencies = {
    accounts,
    withdrawals,
    claims,
    proofs,
    prices,
    receipts,
    directory,
    siteName: SITE,
    assets: new CatalogueAssetRegistry(),
    ids: sequentialIdGenerator(),
    clock: fixedClock(NOW),
    ...overrides,
  };

  return {
    deps,
    accounts,
    withdrawals,
    claims,
    proofs,
    outbox,
    deposit: createRecordDeposit(deps),
    grantDemo: createGrantDemoFunds(deps),
    emailDemo: createSendDemoFundsEmail(deps),
    submitClaim: createSubmitDepositClaim(deps),
    decideClaim: createDecideDepositClaim(deps),
    markConfirming: createMarkDepositConfirming(deps),
    request: createRequestWithdrawal(deps),
    decide: createDecideWithdrawal(deps),
    /** Sent by itself at every step — the customer's copy. */
    email: createSendTransactionEmail(deps),
    /** The console's button, for sending a decided record again. */
    resend: createSendReceipt(deps),
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

describe('demo funds', () => {
  /* The whole reason this is a separate use case: custody's magnitude is the
     platform's liability to its customers, and workshop money must not appear in
     it. If this ever starts failing, the treasury screen has begun lying about
     what is owed. */
  it('credits the customer and leaves custody untouched', async () => {
    const ctx = build();

    const result = await ctx.grantDemo({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '1.5',
      note: 'Tuesday workshop',
      issuedBy: BOB,
    });

    expect(result.ok).toBe(true);

    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    const demo = await ctx.accounts.find(accountIdFor(platformOwner('demo'), 'BTC'));
    const custody = await ctx.accounts.find(accountIdFor(platformOwner('custody'), 'BTC'));

    expect(alice?.balance.toDecimalString()).toBe('1.50000000');
    expect(demo?.balance.toDecimalString()).toBe('-1.50000000');
    // Never opened, because nothing drew on it.
    expect(custody).toBeNull();
    expectBooksBalance(ctx.accounts);
  });

  /* A customer's statement has to say what happened without anybody reading the
     reference — the kind is what is indexed and what a reader sees first. */
  it('posts it under its own kind, never as a deposit', async () => {
    const ctx = build();
    await ctx.grantDemo({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '1',
      issuedBy: BOB,
    });

    const [transfer] = ctx.accounts.posted;
    expect(transfer?.kind).toBe('demo-credit');
    // The issuing operator is always named, so the entry is attributable.
    expect(transfer?.reference).toContain(BOB);
  });

  it('names the note when there is one, and reads cleanly when there is not', async () => {
    const ctx = build();

    await ctx.grantDemo({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '1',
      note: ' group B ',
      issuedBy: BOB,
    });
    await ctx.grantDemo({
      userId: CAROL,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '1',
      note: '   ',
      issuedBy: BOB,
    });

    expect(ctx.accounts.posted[0]?.reference).toBe(
      `demo funds on bitcoin (group B) by ${BOB}`,
    );
    // No empty parentheses and no double space where the note would have been.
    expect(ctx.accounts.posted[1]?.reference).toBe(`demo funds on bitcoin by ${BOB}`);
  });

  it('refuses an amount that is zero, negative or not a number', async () => {
    const ctx = build();

    for (const amount of ['0', '-1', 'lots', '']) {
      const result = await ctx.grantDemo({
        userId: ALICE,
        asset: 'BTC',
        network: 'bitcoin',
        amount,
        issuedBy: BOB,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('amount-invalid');
    }

    expect(ctx.accounts.posted).toHaveLength(0);
  });

  it('refuses an asset the platform does not custody', async () => {
    const ctx = build();
    const result = await ctx.grantDemo({
      userId: ALICE,
      asset: 'DOGE',
      amount: '1',
      issuedBy: BOB,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('asset-not-supported');
  });

  describe('networks', () => {
    /* "USDT" does not say whether a student is being shown a Tron deposit or an
       Ethereum one, and picking the first listed for them would silently put a
       stablecoin on the expensive chain. */
    it('refuses USDT with no network, naming both options', async () => {
      const ctx = build();
      const result = await ctx.grantDemo({
        userId: ALICE,
        asset: 'USDT',
        amount: '500',
        issuedBy: BOB,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('network-required');
      if (result.error.kind !== 'network-required') return;
      expect(result.error.options).toContain('Tron');
      expect(result.error.options).toContain('Ethereum');
    });

    it('refuses a network the asset does not travel on', async () => {
      const ctx = build();
      const result = await ctx.grantDemo({
        userId: ALICE,
        asset: 'USDT',
        network: 'solana',
        amount: '500',
        issuedBy: BOB,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('network-not-supported');
    });

    /* One network is no choice at all, so not making it is not an omission. */
    it('defaults to the only network an asset has', async () => {
      const ctx = build();
      const result = await ctx.grantDemo({
        userId: ALICE,
        asset: 'TRX',
        amount: '100',
        issuedBy: BOB,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.networkLabel).toBe('Tron');
      expect(ctx.accounts.posted[0]?.reference).toContain('on tron');
    });

    /* The property the whole feature rests on: USDT over Tron and USDT over
       Ethereum are one balance, exactly as on a real exchange. The network is the
       route in, not a pot of its own — if this ever splits, a student will be
       shown two USDT balances that do not add up to what they were given. */
    it('credits one balance whichever chain it came in on', async () => {
      const ctx = build();

      await ctx.grantDemo({
        userId: ALICE,
        asset: 'USDT',
        network: 'tron',
        amount: '400',
        issuedBy: BOB,
      });
      await ctx.grantDemo({
        userId: ALICE,
        asset: 'USDT',
        network: 'ethereum',
        amount: '600',
        issuedBy: BOB,
      });

      const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'USDT'));
      expect(alice?.balance.toDecimalString()).toBe('1000.000000');
      expectBooksBalance(ctx.accounts);
    });
  });

  /* The point of the exercise, in a workshop: the student requests a withdrawal
     against demo funds and the tutor decides on it. Nothing about the grant makes
     the balance a second-class one. */
  it('is spendable, and the books still balance when it is spent', async () => {
    const ctx = build();
    await ctx.grantDemo({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '1',
      issuedBy: BOB,
    });

    const requested = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      amount: '0.1',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
    });

    expect(requested.ok).toBe(true);
    expectBooksBalance(ctx.accounts);
  });
});

describe('what a movement says about its chain', () => {
  /** The eight magic bytes the proof validator sniffs for, padded to a plausible size. */
  function png(): Uint8Array {
    const bytes = new Uint8Array(512);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    return bytes;
  }

  /* The statement is where a customer reads this, and USDT is why it matters: one
     asset, one balance, two networks that are not interchangeable. */
  it('records the network and a chain-shaped hash on a demo credit', async () => {
    const ctx = build();
    const granted = await ctx.grantDemo({
      userId: ALICE,
      asset: 'USDT',
      network: 'tron',
      amount: '500',
      issuedBy: BOB,
    });

    expect(granted.ok).toBe(true);
    if (!granted.ok) return;

    const [transfer] = ctx.accounts.posted;
    expect(transfer?.network).toBe('tron');
    // Tron writes bare hex, so no 0x — the prefix is catalogue data per network.
    expect(transfer?.txHash).toMatch(/^[0-9a-f]{64}$/);
    // What the console reports is read back off the transfer, not recomputed.
    expect(granted.value.txHash).toBe(transfer?.txHash);
  });

  it("uses the chain's own hash format, so Ethereum gets its prefix", async () => {
    const ctx = build();
    await ctx.grantDemo({
      userId: ALICE,
      asset: 'USDT',
      network: 'ethereum',
      amount: '500',
      issuedBy: BOB,
    });

    expect(ctx.accounts.posted[0]?.network).toBe('ethereum');
    expect(ctx.accounts.posted[0]?.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  /* The one place a real transaction hash enters this ledger: the customer gave
     it as their evidence and an operator agreed it was right. */
  it("carries the customer's own hash onto an approved deposit", async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '0.25',
      reference: '0xdeadbeefcafe',
      proof: png(),
    } as Parameters<ReturnType<typeof createSubmitDepositClaim>>[0]);
    if (!submitted.ok) throw new Error('setup failed');

    await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'approve',
    });

    const [transfer] = ctx.accounts.posted;
    expect(transfer?.network).toBe('bitcoin');
    expect(transfer?.txHash).toBe('0xdeadbeefcafe');
  });

  /*
   * The honest end of this platform's payout path.
   *
   * Approval moves money to `payable` and nothing broadcasts it, because there is
   * no chain client here. A hash on this row would tell a customer their
   * withdrawal was sent, which is the one thing that has not happened — so if this
   * test ever starts failing, the statement has begun asserting a payment.
   */
  it('gives an approved withdrawal a network and never a hash', async () => {
    const ctx = build();
    await ctx.grantDemo({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      amount: '1',
      issuedBy: BOB,
    });

    // $5,000 at the fake oracle's price, which is one signature. A larger one
    // needs two, would stay pending, and would post no transfer at all — see
    // `approvalsRequired`.
    const requested = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      amount: '0.05',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
    });
    if (!requested.ok) throw new Error('setup failed');

    const decided = await ctx.decide({
      withdrawalId: requested.value.withdrawalId,
      operatorId: BOB,
      decision: 'approve',
      reason: '',
    });
    expect(decided.ok).toBe(true);

    const payout = ctx.accounts.posted.find((transfer) => transfer.kind === 'withdrawal');
    expect(payout?.network).toBe('bitcoin');
    expect(payout?.txHash).toBeNull();
  });
});

describe('the demo funds email', () => {
  /* Not a receipt, and it must not read like one: a message with "Completed"
     under a green tick would undo everything the separate transfer kind does to
     keep workshop money and real money apart. */
  it('says what the funds are in the subject and in both bodies', async () => {
    const ctx = build();
    const result = await ctx.emailDemo({
      userId: ALICE,
      asset: 'USDT',
      amount: '500.000000',
      networkLabel: 'Tron (TRC-20)',
      txHash: '5f2a91c4e8b7d3a60f1c8e2b4d7a90f3c6e1b8d4a7f2c9e0b3d6a1f4c7e2b9d0',
      note: 'Tuesday workshop',
      balance: '500.000000',
    });

    expect(result.ok).toBe(true);
    const [message] = ctx.outbox;

    expect(message?.subject).toContain('Demo funds');
    // Trailing zeros dropped for reading. The record keeps its own precision.
    expect(message?.subject).toContain('500 USDT');
    for (const body of [message?.text ?? '', message?.html ?? '']) {
      expect(body).toContain('demo funds');
      expect(body).toContain('Tron (TRC-20)');
      expect(body).toContain('Tuesday workshop');
    }
    // The word a receipt uses under its outcome mark. This message has neither.
    expect(message?.html).not.toContain('Completed');
  });

  it('reports a missing address rather than throwing', async () => {
    // The price oracle is left alone; the second argument is what this is about.
    const ctx = build(undefined, {
      directory: {
        async emailFor() {
          return null;
        },
      },
    });
    const result = await ctx.emailDemo({
      userId: ALICE,
      asset: 'TRX',
      amount: '100.000000',
      networkLabel: 'Tron',
      txHash: 'b9d0e2c7f4a1d6b3e0c9f2a4d8b1e6c3f0a9d7b4e2c8a1f6d3b7e4c1a0f9d2b5',
      balance: '100.000000',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('receipt-no-address');
  });
});


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

/**
 * A token is moved by the chain it lives on, and the chain charges its own coin.
 *
 * These read a little oddly next to the rest of the file, because the customer in
 * them is rich in the thing they are withdrawing and holds none of the thing that
 * pays for it — which is exactly the position somebody is in after buying USDT and
 * nothing else, and exactly the request that used to be accepted and then sit in
 * the queue waiting for an operator to discover it could not be sent.
 */
describe('a token that cannot pay its own network fee', () => {
  /** Prices what the catalogue actually offers here; the default one knows only BTC. */
  const stablePrices: PriceOracle = {
    async valueInUsd(amount: Money) {
      if (amount.currency === 'USD') return amount.withScale(2);
      if (amount.currency === 'USDT') return Money.of(amount.minorUnits / 10_000n, 'USD', 2);
      if (amount.currency === 'TRX') return Money.of(amount.minorUnits / 100_000n, 'USD', 2);
      return null;
    },
  };

  async function withBalances(usdt: string, trx: string | null) {
    const ctx = build(stablePrices);
    await ctx.deposit({
      userId: ALICE,
      asset: 'USDT',
      amount: usdt,
      reference: 'seed-usdt',
      recordedBy: BOB,
    });
    if (trx !== null) {
      await ctx.deposit({
        userId: ALICE,
        asset: 'TRX',
        amount: trx,
        reference: 'seed-trx',
        recordedBy: BOB,
      });
    }
    return ctx;
  }

  const request = (ctx: ReturnType<typeof build>) =>
    ctx.request({
      userId: ALICE,
      asset: 'USDT',
      network: 'tron',
      destination: TRON_ADDRESS,
      amount: '20',
    });

  it('refuses USDT on Tron when the customer holds no TRX', async () => {
    const ctx = await withBalances('50', null);

    const result = await request(ctx);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('gas-token-required');
    // The coin to go and get, named — "you need gas" is not an instruction.
    if (result.error.kind === 'gas-token-required') {
      expect(result.error.nativeAsset).toBe('TRX');
      expect(result.error.asset).toBe('USDT');
    }
    // And nothing was reserved: a refused request must leave the balance alone.
    expect(ctx.withdrawals.store).toHaveLength(0);
    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'USDT'));
    expect(alice?.available.toDecimalString()).toBe('50.000000');
  });

  it('accepts the same request once there is TRX to pay the fee', async () => {
    const ctx = await withBalances('50', '25');

    const result = await request(ctx);

    expect(result.ok).toBe(true);
    // Queued for an operator, exactly like any other withdrawal.
    expect(ctx.withdrawals.store).toHaveLength(1);
  });

  it('asks for no second balance when the coin pays its own way', async () => {
    // BTC over Bitcoin: the fee comes out of the same asset, so a customer holding
    // nothing else is not blocked. Guards against the rule being applied to every
    // withdrawal rather than to tokens on somebody else's chain.
    const ctx = build();
    await ctx.deposit({
      userId: ALICE,
      asset: 'BTC',
      amount: '1.0',
      reference: 'seed',
      recordedBy: BOB,
    });

    const result = await ctx.request({
      userId: ALICE,
      asset: 'BTC',
      network: 'bitcoin',
      destination: BTC_ADDRESS,
      amount: '0.05',
    });

    expect(result.ok).toBe(true);
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

  /*
   * The form stopped asking for a transaction hash.
   *
   * It used to be required, and the requirement bought nothing: the string came
   * from the same person as the screenshot, and what actually settles a claim is
   * the operator finding the transfer themselves and crediting the amount *they*
   * verified. Refusing the claim only stopped somebody who could not find their
   * hash from reporting a transfer that had genuinely happened.
   */
  it('accepts a claim with no transaction reference', async () => {
    const ctx = build();
    const result = await ctx.submitClaim(claim({ reference: '   ' }));

    expect(result.ok).toBe(true);
    // Still stored against the claim, and still nothing credited until an operator
    // decides — see the approval test below.
    expect(ctx.proofs.store.size).toBe(1);
    if (result.ok) {
      const stored = await ctx.claims.find(result.value.claimId);
      expect(stored?.snapshot().reference).toBe('');
    }
  });

  it('still refuses a claim with no screenshot behind it', async () => {
    // The evidence that does matter. Dropping the reference must not be read as
    // dropping the proof.
    const ctx = build();
    const result = await ctx.submitClaim(claim({ proof: new Uint8Array([1, 2, 3]) }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('proof-invalid');
    expect(ctx.proofs.store.size).toBe(0);
  });

  describe('confirming on chain', () => {
    /* The state exists so a customer can tell "nobody has looked" from "we have
       looked, blocks are slow". Nothing about it may move money. */
    it('changes the status, credits nothing, and decides nothing', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      const marked = await ctx.markConfirming({
        claimId: submitted.value.claimId,
        operatorId: BOB,
        note: '  3 of 6 confirmations, ~20 min  ',
      });

      expect(marked.ok).toBe(true);
      expect(ctx.accounts.posted).toHaveLength(0);

      const stored = await ctx.claims.find(submitted.value.claimId);
      expect(stored?.status).toBe('confirming');
      // Trimmed, and shown to the customer verbatim.
      expect(stored?.confirmingNote).toBe('3 of 6 confirmations, ~20 min');
      expect(stored?.confirmingBy).toBe(BOB);
      expect(stored?.confirmingAt).toEqual(NOW);
      // Not a decision. These two are what "decided" means on this record.
      expect(stored?.decidedAt).toBeNull();
      expect(stored?.decidedBy).toBeNull();
      // And not a refusal: the note has its own field so the wallet cannot render
      // it as one.
      expect(stored?.reason).toBeNull();
    });

    it('leaves an empty note null rather than storing a blank', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      await ctx.markConfirming({
        claimId: submitted.value.claimId,
        operatorId: BOB,
        note: '   ',
      });

      const stored = await ctx.claims.find(submitted.value.claimId);
      expect(stored?.confirmingNote).toBeNull();
    });

    /* A queue that dropped confirming claims would be a list of work an operator
       can lose track of by marking something as in progress. */
    it('stays in the operator queue', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      await ctx.markConfirming({ claimId: submitted.value.claimId, operatorId: BOB });

      const queue = await ctx.claims.listPending(10);
      expect(queue.map((entry) => entry.id)).toContain(submitted.value.claimId);
    });

    it('can still be approved afterwards, and credits normally', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      await ctx.markConfirming({ claimId: submitted.value.claimId, operatorId: BOB });
      const decided = await ctx.decideClaim({
        claimId: submitted.value.claimId,
        operatorId: BOB,
        decision: 'approve',
      });

      expect(decided.ok).toBe(true);
      const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
      expect(alice?.balance.toDecimalString()).toBe('0.25000000');
      expectBooksBalance(ctx.accounts);
    });

    /* Marking something as confirming must not trap it there — a transaction that
       never arrives has to be refusable with its reason. */
    it('can still be rejected afterwards', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      await ctx.markConfirming({ claimId: submitted.value.claimId, operatorId: BOB });
      const decided = await ctx.decideClaim({
        claimId: submitted.value.claimId,
        operatorId: BOB,
        decision: 'reject',
        reason: 'It never confirmed',
      });

      expect(decided.ok).toBe(true);
      const stored = await ctx.claims.find(submitted.value.claimId);
      expect(stored?.status).toBe('rejected');
      expect(ctx.accounts.posted).toHaveLength(0);
    });

    /* Re-marking would overwrite the timestamp that says how long the wait has
       been running, which is the one figure the state exists to carry. */
    it('refuses to mark the same claim twice', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      await ctx.markConfirming({ claimId: submitted.value.claimId, operatorId: BOB });
      const again = await ctx.markConfirming({
        claimId: submitted.value.claimId,
        operatorId: BOB,
      });

      expect(again.ok).toBe(false);
    });

    it('refuses to mark a claim that has already been decided', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      await ctx.decideClaim({
        claimId: submitted.value.claimId,
        operatorId: BOB,
        decision: 'approve',
      });
      const marked = await ctx.markConfirming({
        claimId: submitted.value.claimId,
        operatorId: BOB,
      });

      expect(marked.ok).toBe(false);
    });

    /* Nothing is credited by marking, so there is no self-dealing to guard
       against — the worst an operator can do to their own claim here is tell
       themselves to keep waiting. */
    it('lets an operator mark their own claim', async () => {
      const ctx = build();
      const submitted = await ctx.submitClaim(claim());
      if (!submitted.ok) throw new Error('setup failed');

      const marked = await ctx.markConfirming({
        claimId: submitted.value.claimId,
        operatorId: ALICE,
      });

      expect(marked.ok).toBe(true);
      expect(ctx.accounts.posted).toHaveLength(0);
    });
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
  /*
   * Self-approval is currently ALLOWED, and this test asserts that on purpose.
   *
   * The rule is commented out in `DepositClaim.approve` for a workshop deployment,
   * where a tutor demonstrating on their own account is the ordinary case. A test
   * that still asserted the old behaviour would be a failing suite somebody
   * eventually silences; one that asserts the new behaviour fails the moment the
   * rule is restored, which is exactly when somebody should be made to look here.
   *
   * To restore it: uncomment the check in `approve` and invert this test back to
   * expecting `approval-refused`.
   */
  it('currently allows an operator to approve their own deposit', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(claim());
    if (!submitted.ok) throw new Error('setup failed');

    const decided = await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: ALICE,
      decision: 'approve',
    });

    expect(decided.ok).toBe(true);
    const alice = await ctx.accounts.find(accountIdFor(userOwner(ALICE), 'BTC'));
    expect(alice?.balance.toDecimalString()).toBe('0.25000000');
    expectBooksBalance(ctx.accounts);
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

/**
 * What lands in a customer's inbox at each step.
 *
 * The rule under test is that the wording follows the record's *state*, not the
 * caller's intention: a request still waiting must never read as a receipt, and a
 * refusal must never say money was taken. Both were sent by hand before and are now
 * sent for every request and every decision, so a wrong word reaches everybody
 * rather than whoever an operator pressed the button for.
 */
describe('emails to the customer', () => {
  const PNG_CLAIM = {
    userId: ALICE,
    asset: 'BTC',
    network: 'bitcoin',
    amount: '0.25',
    reference: '0xdeadbeefcafe',
    proof: (() => {
      const bytes = new Uint8Array(512);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      return bytes;
    })(),
  } as Parameters<ReturnType<typeof createSubmitDepositClaim>>[0];

  async function withdrawing(amount: string) {
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

  it('acknowledges a withdrawal request in words that cannot be read as a receipt', async () => {
    const { ctx, id } = await withdrawing('0.05');

    const sent = await ctx.email({ kind: 'withdrawal', recordId: id });

    expect(sent.ok).toBe(true);
    const mail = ctx.outbox.at(-1);
    expect(mail?.to).toBe(`${ALICE.slice(0, 8)}@example.com`);
    expect(mail?.subject).toBe('Your withdrawal request is being reviewed — 0.05 BTC');
    expect(mail?.text).toContain('Awaiting a decision.');
    expect(mail?.text).toContain('Nothing has left your account yet.');
    expect(mail?.text).toContain('It is not a receipt');
    // Held, not taken, and the document has to say which.
    expect(mail?.text).toContain('Total on hold');
    expect(mail?.text).not.toContain('Total debited');
    expect(mail?.text).not.toContain('Amount sent');
  });

  it('reads the record, so one signature of two still reads as under review', async () => {
    const { ctx, id } = await withdrawing('0.15'); // $15,000 — two signatures

    const first = await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });
    expect(first.ok).toBe(true);

    await ctx.email({ kind: 'withdrawal', recordId: id });
    expect(ctx.outbox.at(-1)?.subject).toContain('is being reviewed');

    await ctx.decide({ withdrawalId: id, operatorId: CAROL, decision: 'approve' });
    await ctx.email({ kind: 'withdrawal', recordId: id });
    expect(ctx.outbox.at(-1)?.subject).toBe('Receipt for your withdrawal — 0.15 BTC');
  });

  it('sends the receipt once a withdrawal is approved', async () => {
    const { ctx, id } = await withdrawing('0.05');
    await ctx.decide({ withdrawalId: id, operatorId: BOB, decision: 'approve' });

    await ctx.email({ kind: 'withdrawal', recordId: id });

    const mail = ctx.outbox.at(-1);
    expect(mail?.subject).toBe('Receipt for your withdrawal — 0.05 BTC');
    expect(mail?.text).toContain('Completed.');
    expect(mail?.text).toContain('Amount sent');
    expect(mail?.text).toContain('Total debited');
    expect(mail?.text).toContain(BTC_ADDRESS);
  });

  it('tells a refused customer why, and that nothing was debited', async () => {
    const { ctx, id } = await withdrawing('0.05');
    await ctx.decide({
      withdrawalId: id,
      operatorId: BOB,
      decision: 'reject',
      reason: 'The destination address is on a sanctions list',
    });

    await ctx.email({ kind: 'withdrawal', recordId: id });

    const mail = ctx.outbox.at(-1);
    expect(mail?.subject).toBe(`Your withdrawal was not accepted — ${id}`);
    expect(mail?.text).toContain('Reason: The destination address is on a sanctions list');
    expect(mail?.text).toContain('Total released');
    // Nothing was ever taken, so the document must not say it was.
    expect(mail?.text).not.toContain('Total debited');
  });

  it('says a reported deposit is not credited yet, then that it is', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(PNG_CLAIM);
    if (!submitted.ok) throw new Error('setup failed');

    await ctx.email({ kind: 'deposit', recordId: submitted.value.claimId });
    const acknowledged = ctx.outbox.at(-1);
    expect(acknowledged?.subject).toBe('Your deposit is being reviewed — 0.25 BTC');
    expect(acknowledged?.text).toContain('Nothing has been credited yet.');
    expect(acknowledged?.text).toContain('Amount you reported');

    await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'approve',
      creditedAmount: '0.2498',
    });
    await ctx.email({ kind: 'deposit', recordId: submitted.value.claimId });

    const credited = ctx.outbox.at(-1);
    // The figure an operator verified, which is the one that reached the balance.
    expect(credited?.subject).toBe('Receipt for your deposit — 0.2498 BTC');
    expect(credited?.text).toContain('Amount credited: 0.2498 BTC');
    expect(credited?.text).toContain('Amount you reported: 0.25 BTC');
  });

  it('carries a refused deposit’s reason', async () => {
    const ctx = build();
    const submitted = await ctx.submitClaim(PNG_CLAIM);
    if (!submitted.ok) throw new Error('setup failed');

    await ctx.decideClaim({
      claimId: submitted.value.claimId,
      operatorId: BOB,
      decision: 'reject',
      reason: 'No matching transaction on chain',
    });
    await ctx.email({ kind: 'deposit', recordId: submitted.value.claimId });

    const mail = ctx.outbox.at(-1);
    expect(mail?.subject).toContain('was not accepted');
    expect(mail?.text).toContain('Not accepted.');
    expect(mail?.text).toContain('Reason: No matching transaction on chain');
  });

  it('still refuses the console’s button while a record is undecided', async () => {
    const { ctx, id } = await withdrawing('0.05');

    const pressed = await ctx.resend({ kind: 'withdrawal', recordId: id });

    expect(pressed.ok).toBe(false);
    if (!pressed.ok) expect(pressed.error.kind).toBe('receipt-not-yet-available');
    expect(ctx.outbox).toHaveLength(0);
  });

  it('signs the mail with the deployment’s name, not a fixed brand', async () => {
    const { ctx, id } = await withdrawing('0.05');

    await ctx.email({ kind: 'withdrawal', recordId: id });

    const mail = ctx.outbox.at(-1);
    expect(mail?.text.startsWith(SITE)).toBe(true);
    expect(mail?.html).toContain(SITE.toUpperCase());
    expect(mail?.html).not.toContain('NOVEX');
  });

  it('masks the address it reports back to the caller', async () => {
    const { ctx, id } = await withdrawing('0.05');

    const sent = await ctx.email({ kind: 'withdrawal', recordId: id });

    expect(sent.ok).toBe(true);
    if (sent.ok) {
      expect(sent.value.reference).toBe(id);
      expect(sent.value.sentTo).toBe(`${ALICE.slice(0, 1)}•••••••@example.com`);
    }
  });
});
