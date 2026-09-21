import { describe, expect, it } from 'vitest';

import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { accountIdFor, LedgerAccount, platformOwner, userOwner } from '../account';
import { APPROVALS_REQUIRED } from '../approvals';
import { Transfer } from '../transfer';
import { Withdrawal } from '../withdrawal';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const ALICE = '11111111-1111-4111-8111-111111111111' as UserId;
const BOB = '22222222-2222-4222-8222-222222222222' as UserId;
const CAROL = '33333333-3333-4333-8333-333333333333' as UserId;

const btc = (value: string) => Money.fromDecimalString(value, 'BTC', 8);
const usd = (value: string) => Money.fromDecimalString(value, 'USD', 2);

const BITCOIN = { code: 'BTC', scale: 8 };

function account(owner = userOwner(ALICE)): LedgerAccount {
  return LedgerAccount.open(owner, BITCOIN.code, BITCOIN.scale);
}

describe('account identity', () => {
  it('derives an addressable id from owner and asset', () => {
    expect(accountIdFor(userOwner(ALICE), 'btc')).toBe(`user:${ALICE}:BTC`);
    expect(accountIdFor(platformOwner('custody'), 'BTC')).toBe('platform:custody:BTC');
  });
});

describe('balances and holds', () => {
  it('separates what is held from what may be spent', () => {
    const acc = account();
    acc.applyDelta(btc('1.00000000'));

    expect(acc.hold(btc('0.30000000'))).toBe(true);
    expect(acc.balance.toDecimalString()).toBe('1.00000000');
    expect(acc.held.toDecimalString()).toBe('0.30000000');
    expect(acc.available.toDecimalString()).toBe('0.70000000');
  });

  /* The check that stops the same balance funding two withdrawals. */
  it('refuses a hold larger than what is free', () => {
    const acc = account();
    acc.applyDelta(btc('1.00000000'));
    acc.hold(btc('0.80000000'));

    expect(acc.hold(btc('0.30000000'))).toBe(false);
    expect(acc.held.toDecimalString()).toBe('0.80000000');
  });

  it('gives a reservation back on release', () => {
    const acc = account();
    acc.applyDelta(btc('1.00000000'));
    acc.hold(btc('0.40000000'));
    acc.release(btc('0.40000000'));

    expect(acc.available.toDecimalString()).toBe('1.00000000');
  });

  it('refuses to release what was never held', () => {
    expect(() => account().release(btc('0.10000000'))).toThrow(RangeError);
  });

  /* Money that does not exist is the failure this whole module is built to
     prevent, so a customer account simply cannot go negative. */
  it('refuses to overdraw a customer account', () => {
    const acc = account();
    acc.applyDelta(btc('0.50000000'));

    expect(() => acc.applyDelta(btc('-0.60000000'))).toThrow(RangeError);
    expect(acc.balance.toDecimalString()).toBe('0.50000000');
  });

  /* Custody is negative by construction — its magnitude is what the platform owes
     its customers — so the overdraw rule is scoped to the accounts where negative
     would be wrong. */
  it('allows a platform account to go negative', () => {
    const custody = account(platformOwner('custody'));
    custody.applyDelta(btc('-2.00000000'));

    expect(custody.balance.toDecimalString()).toBe('-2.00000000');
  });
});

describe('transfers must balance', () => {
  const base = {
    id: 't1',
    kind: 'deposit' as const,
    occurredAt: NOW,
    reference: 'test',
    network: null,
    txHash: null,
  };

  it('accepts a balanced pair', () => {
    const transfer = Transfer.create({
      ...base,
      entries: [
        { accountId: 'a', delta: btc('1.00000000') },
        { accountId: 'b', delta: btc('-1.00000000') },
      ],
    });

    expect(transfer.assets).toEqual(['BTC']);
  });

  /* The invariant the type exists for. A system that can write this can create
     money, and it will eventually do so through a branch nobody tested. */
  it('refuses entries that do not sum to zero', () => {
    expect(() =>
      Transfer.create({
        ...base,
        entries: [
          { accountId: 'a', delta: btc('1.00000000') },
          { accountId: 'b', delta: btc('-0.90000000') },
        ],
      }),
    ).toThrow(RangeError);
  });

  /* Summing across assets would let "−1 BTC, +1 USD" pass as balanced, which is how
     a ledger loses a bitcoin and reports that everything adds up. */
  it('balances per asset, not overall', () => {
    expect(() =>
      Transfer.create({
        ...base,
        entries: [
          { accountId: 'a', delta: btc('-1.00000000') },
          { accountId: 'b', delta: usd('1.00') },
        ],
      }),
    ).toThrow(RangeError);
  });

  /*
   * The two tethers, and why splitting the asset code was the fix.
   *
   * `USDT_ERC20` and `USDT_TRC20` are different contracts on unconnected chains.
   * Moving value between them needs a bridge and a counterparty, so a transfer
   * that takes from one and gives to the other is not a movement — it is minting
   * on one chain and burning on another, with nothing in between.
   *
   * The per-asset rule already refuses it, and that is the whole point of making
   * them two codes rather than one asset with a network column: the ledger cannot
   * pool them even if a caller asks it to. This test exists so that a future
   * "simplification" back to a single `USDT` code fails here, loudly, instead of
   * quietly restoring a balance nobody can withdraw.
   */
  it('refuses to move value between the two tethers, which are not one asset', () => {
    const erc20 = (value: string) => Money.fromDecimalString(value, 'USDT_ERC20', 6);
    const trc20 = (value: string) => Money.fromDecimalString(value, 'USDT_TRC20', 6);

    expect(() =>
      Transfer.create({
        ...base,
        kind: 'adjustment',
        entries: [
          { accountId: 'a', delta: erc20('-100.000000') },
          { accountId: 'b', delta: trc20('100.000000') },
        ],
      }),
    ).toThrow(RangeError);
  });

  it('keeps the two tethers as separate assets on one transfer', () => {
    const erc20 = (value: string) => Money.fromDecimalString(value, 'USDT_ERC20', 6);
    const trc20 = (value: string) => Money.fromDecimalString(value, 'USDT_TRC20', 6);

    const transfer = Transfer.create({
      ...base,
      kind: 'adjustment',
      entries: [
        { accountId: 'a', delta: erc20('-100.000000') },
        { accountId: 'b', delta: erc20('100.000000') },
        { accountId: 'c', delta: trc20('-40.000000') },
        { accountId: 'd', delta: trc20('40.000000') },
      ],
    });

    // Two assets, never collapsed into one "USDT".
    expect(new Set(transfer.assets)).toEqual(new Set(['USDT_ERC20', 'USDT_TRC20']));
  });

  it('accepts a multi-asset transfer where each asset balances', () => {
    const transfer = Transfer.create({
      ...base,
      kind: 'adjustment',
      entries: [
        { accountId: 'a', delta: btc('-1.00000000') },
        { accountId: 'b', delta: btc('1.00000000') },
        { accountId: 'c', delta: usd('-50.00') },
        { accountId: 'd', delta: usd('50.00') },
      ],
    });

    expect(new Set(transfer.assets)).toEqual(new Set(['BTC', 'USD']));
  });

  it('refuses a single-legged transfer and an unexplained one', () => {
    expect(() =>
      Transfer.create({ ...base, entries: [{ accountId: 'a', delta: btc('0.00000000') }] }),
    ).toThrow(RangeError);

    expect(() =>
      Transfer.create({
        ...base,
        reference: '   ',
        entries: [
          { accountId: 'a', delta: btc('1.00000000') },
          { accountId: 'b', delta: btc('-1.00000000') },
        ],
      }),
    ).toThrow(RangeError);
  });

  /* Storage is trusted elsewhere in this codebase; here it is re-checked, because
     what is being trusted is that no migration or manual UPDATE ever unbalanced a
     transfer. */
  it('re-checks the invariant when rehydrating', () => {
    expect(() =>
      Transfer.rehydrate({
        ...base,
        entries: [
          { accountId: 'a', delta: btc('1.00000000') },
          { accountId: 'b', delta: btc('-0.50000000') },
        ],
      }),
    ).toThrow(RangeError);
  });
});

describe('withdrawal approval', () => {
  function pending(valued = usd('5000.00'), owner: UserId = ALICE): Withdrawal {
    return Withdrawal.request({
      id: 'w1',
      userId: owner,
      amount: btc('0.50000000'),
      fee: btc('0.00004000'),
      network: 'bitcoin',
      destination: 'bc1qexampleaddressvaluethatislongenough',
      valuedAtUsd: valued,
      now: NOW,
    });
  }

  it('reserves the amount plus the fee', () => {
    expect(pending().totalReserved.toDecimalString()).toBe('0.50004000');
  });

  it('completes on a single approval below the dual-control threshold', () => {
    const withdrawal = pending();
    expect(withdrawal.approve(BOB, 1, NOW)).toBe(true);
    expect(withdrawal.status).toBe('approved');
  });

  it('stays pending until the second signature above the threshold', () => {
    const withdrawal = pending();

    expect(withdrawal.approve(BOB, 2, NOW)).toBe(false);
    expect(withdrawal.status).toBe('pending');

    expect(withdrawal.approve(CAROL, 2, NOW)).toBe(true);
    expect(withdrawal.status).toBe('approved');
    expect(withdrawal.approvals).toHaveLength(2);
  });

  /* Otherwise dual control is one person clicking the same button in two tabs. */
  it('refuses the same operator twice', () => {
    const withdrawal = pending();
    withdrawal.approve(BOB, 2, NOW);

    expect(() => withdrawal.approve(BOB, 2, NOW)).toThrow(RangeError);
    expect(withdrawal.status).toBe('pending');
  });

  /*
   * Self-approval is currently ALLOWED, and this asserts that on purpose.
   *
   * The rule is commented out in `Withdrawal.approve` for a deployment used to
   * teach people how withdrawals work. A test still asserting the old behaviour
   * would be a failing suite somebody eventually silences; one asserting the new
   * behaviour fails the moment the rule comes back, which is exactly when a reader
   * should be sent to that comment.
   *
   * To restore: uncomment the check in `approve` and invert this back to
   * `toThrow(RangeError)`.
   */
  it('currently allows self-approval', () => {
    const withdrawal = pending(usd('5000.00'), BOB);
    expect(() => withdrawal.approve(BOB, 1, NOW)).not.toThrow();
  });

  /* This half of dual control is untouched, and is the one that still makes the
     second signature mean a second person. */
  it('still refuses the same operator approving twice', () => {
    const withdrawal = pending(usd('5000.00'), BOB);
    withdrawal.approve(CAROL, 2, NOW);

    expect(() => withdrawal.approve(CAROL, 2, NOW)).toThrow(RangeError);
  });

  it('refuses a decision on something already decided', () => {
    const withdrawal = pending();
    withdrawal.approve(BOB, 1, NOW);

    expect(() => withdrawal.reject(CAROL, 'too late', NOW)).toThrow(RangeError);
  });

  /* Declining to move money is always safe; requiring a second signature to stop a
     payment would mean an operator who spots fraud cannot act on it. */
  it('lets one operator reject regardless of the threshold', () => {
    const withdrawal = pending(usd('900000.00'));
    withdrawal.reject(BOB, 'Destination flagged by surveillance', NOW);

    expect(withdrawal.status).toBe('rejected');
    expect(withdrawal.reason).toBe('Destination flagged by surveillance');
  });

  it('refuses a rejection with no reason, because the customer is told', () => {
    expect(() => pending().reject(BOB, '   ', NOW)).toThrow(RangeError);
  });

  it('refuses a zero or negative request', () => {
    expect(() =>
      Withdrawal.request({
        id: 'w2',
        userId: ALICE,
        amount: btc('0.00000000'),
        fee: btc('0.00004000'),
        network: 'bitcoin',
        destination: 'bc1q…',
        valuedAtUsd: usd('0.00'),
        now: NOW,
      }),
    ).toThrow(RangeError);
  });
});

/*
 * The `limits` suite that used to be here covered a tier ladder, a daily USD cap
 * and a dual-control threshold. None of those exist now — `domain/limits.ts` was
 * replaced by `domain/approvals.ts`, which holds one number — so the tests that
 * asserted where each boundary fell went with them.
 */
describe('approvals', () => {
  it('needs one signature, whatever the amount', () => {
    expect(APPROVALS_REQUIRED).toBe(1);
  });
});
