import { logger } from '@/platform/observability/logger';
import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { userOwner, type LedgerAccount } from '../../domain/account';
import { approvalsRequired, limitsFor, tierFor } from '../../domain/limits';
import type { Withdrawal } from '../../domain/withdrawal';
import {
  maskDestination,
  type BalanceDto,
  type WalletDto,
  type WithdrawalDto,
} from '../dto';
import type { LedgerDependencies } from '../ports';
import { startOfDayUtc } from '../use-cases/request-withdrawal';

/**
 * One customer's wallet: balances, what they are worth, and today's remaining room.
 *
 * ── Degrades rather than propagating ───────────────────────────────────────────
 * A failed read returns an empty wallet flagged `degraded`. The page then says it
 * could not load rather than showing a total of zero, which on a money screen is
 * not a degraded state — it is a false statement about someone's savings.
 */

const UNAVAILABLE: Omit<WalletDto, 'limits'> = {
  balances: [],
  totalValueUsd: null,
  valuationIncomplete: true,
  pendingWithdrawals: [],
  degraded: true,
};

export async function getWallet(
  deps: LedgerDependencies,
  userId: UserId,
): Promise<WalletDto> {
  const limits = limitsFor(tierFor());
  const now = deps.clock.now();
  const resetsAt = new Date(startOfDayUtc(now).getTime() + 24 * 60 * 60_000);

  const emptyLimits = {
    tier: limits.tier,
    capUsd: limits.dailyWithdrawalUsd.toDecimalString(),
    usedUsd: '0.00',
    remainingUsd: limits.dailyWithdrawalUsd.toDecimalString(),
    resetsAt: resetsAt.toISOString(),
  };

  // `allSettled`, not `all`: the realistic failure is an unreachable database, in
  // which case every one of these rejects. `Promise.all` would surface the first
  // and leave the rest unattached, and Node terminates the process on an unhandled
  // rejection by default.
  const [accountsResult, usedResult, pendingResult] = await Promise.allSettled([
    deps.accounts.listForOwner(userOwner(userId)),
    deps.withdrawals.usedSince(userId, startOfDayUtc(now)),
    deps.withdrawals.listForUser(userId, 20),
  ]);

  if (accountsResult.status === 'rejected') {
    logger.error({ event: 'wallet_read_failed', module: 'ledger', userId }, accountsResult.reason);
    return { ...UNAVAILABLE, limits: emptyLimits };
  }

  const balances = await valueBalances(deps, accountsResult.value);

  const used =
    usedResult.status === 'fulfilled' ? usedResult.value : Money.zero('USD', 2);
  if (usedResult.status === 'rejected') {
    logger.warn({ event: 'wallet_limit_read_failed', module: 'ledger', userId }, usedResult.reason);
  }

  const remaining = limits.dailyWithdrawalUsd.subtract(used);

  const pending =
    pendingResult.status === 'fulfilled'
      ? pendingResult.value.filter((w) => w.status === 'pending').map(toWithdrawalDto)
      : [];

  const priced = balances.filter((balance) => balance.valueUsd !== null);
  const incomplete = priced.length !== balances.length;

  return {
    balances,
    // Null when anything is unpriceable — see `WalletDto.totalValueUsd`.
    totalValueUsd: incomplete
      ? null
      : priced
          .reduce(
            (sum, balance) =>
              sum.add(Money.fromDecimalString(balance.valueUsd ?? '0', 'USD', 2)),
            Money.zero('USD', 2),
          )
          .toDecimalString(),
    valuationIncomplete: incomplete,
    limits: {
      tier: limits.tier,
      capUsd: limits.dailyWithdrawalUsd.toDecimalString(),
      usedUsd: used.toDecimalString(),
      remainingUsd: (remaining.isNegative ? Money.zero('USD', 2) : remaining).toDecimalString(),
      resetsAt: resetsAt.toISOString(),
    },
    pendingWithdrawals: pending,
    degraded: false,
  };
}

/**
 * Attaches a USD value to each holding.
 *
 * Priced one asset at a time and tolerantly: a single asset the feed has stopped
 * covering costs that row its value and nothing else. Letting it throw would blank
 * a customer's entire wallet because one altcoin went quiet.
 */
async function valueBalances(
  deps: LedgerDependencies,
  accounts: readonly LedgerAccount[],
): Promise<BalanceDto[]> {
  const held = accounts.filter((account) => !account.balance.isZero);

  const valued = await Promise.all(
    held.map(async (account) => {
      const asset = deps.assets.find(account.asset);
      let valueUsd: string | null = null;

      try {
        const value = await deps.prices.valueInUsd(account.balance);
        valueUsd = value === null ? null : value.toDecimalString();
      } catch (error) {
        logger.warn(
          { event: 'balance_valuation_failed', module: 'ledger', asset: account.asset },
          error,
        );
      }

      return {
        asset: account.asset,
        name: asset?.name ?? account.asset,
        scale: account.balance.scale,
        total: account.balance.toDecimalString(),
        available: account.available.toDecimalString(),
        held: account.held.toDecimalString(),
        valueUsd,
      } satisfies BalanceDto;
    }),
  );

  // Largest holding first, and unpriceable rows last rather than treated as zero —
  // they sort to the bottom because we cannot rank them, not because they are worth
  // nothing.
  return valued.sort((a, b) => {
    if (a.valueUsd === null) return 1;
    if (b.valueUsd === null) return -1;
    return Number(b.valueUsd) - Number(a.valueUsd);
  });
}

export function toWithdrawalDto(withdrawal: Withdrawal): WithdrawalDto {
  const required = approvalsRequired(withdrawal.valuedAtUsd, limitsFor(tierFor()));

  return {
    id: withdrawal.id,
    userId: withdrawal.userId,
    asset: withdrawal.asset,
    amount: withdrawal.amount.toDecimalString(),
    fee: withdrawal.fee.toDecimalString(),
    network: withdrawal.network,
    destination: maskDestination(withdrawal.destination),
    valueUsd: withdrawal.valuedAtUsd?.toDecimalString() ?? null,
    status: withdrawal.status,
    requestedAt: withdrawal.requestedAt.toISOString(),
    decidedAt: withdrawal.decidedAt?.toISOString() ?? null,
    reason: withdrawal.reason,
    approvalsHeld: withdrawal.approvals.length,
    approvalsRequired: required,
  };
}
