import { logger } from '@/platform/observability/logger';
import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { userOwner, type LedgerAccount } from '../../domain/account';
import { APPROVALS_REQUIRED } from '../../domain/approvals';
import type { Withdrawal } from '../../domain/withdrawal';
import {
  maskDestination,
  type BalanceDto,
  type WalletDto,
  type WithdrawalDto,
} from '../dto';
import type { LedgerDependencies } from '../ports';

/**
 * One customer's wallet: balances and what they are worth.
 *
 * ── Degrades rather than propagating ───────────────────────────────────────────
 * A failed read returns an empty wallet flagged `degraded`. The page then says it
 * could not load rather than showing a total of zero, which on a money screen is
 * not a degraded state — it is a false statement about someone's savings.
 *
 * ── It no longer reads a daily allowance ───────────────────────────────────────
 * This query used to also fetch how much had been withdrawn since midnight UTC and
 * subtract it from a tier cap. There is no cap, so there is nothing to subtract and
 * one fewer query to make.
 */

const UNAVAILABLE: WalletDto = {
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
  // `allSettled`, not `all`: the realistic failure is an unreachable database, in
  // which case every one of these rejects. `Promise.all` would surface the first
  // and leave the rest unattached, and Node terminates the process on an unhandled
  // rejection by default.
  const [accountsResult, pendingResult] = await Promise.allSettled([
    deps.accounts.listForOwner(userOwner(userId)),
    deps.withdrawals.listForUser(userId, 20),
  ]);

  if (accountsResult.status === 'rejected') {
    logger.error({ event: 'wallet_read_failed', module: 'ledger', userId }, accountsResult.reason);
    return UNAVAILABLE;
  }

  const balances = await valueBalances(deps, accountsResult.value);

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
        // Falls back to the code when the catalogue has lost an asset somebody
        // still holds. A balance must render even when its definition has been
        // removed from under it — that is a row somebody needs to see, not hide.
        ticker: asset?.ticker ?? account.asset,
        name: asset?.name ?? account.asset,
        // One network means the chain is a property of the holding and is shown
        // on it. Several means the question has no single answer here.
        network: asset?.networks.length === 1 ? (asset.networks[0]?.id ?? null) : null,
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
    approvalsRequired: APPROVALS_REQUIRED,
  };
}
