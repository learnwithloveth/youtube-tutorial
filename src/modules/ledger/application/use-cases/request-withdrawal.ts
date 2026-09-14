import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { userOwner } from '../../domain/account';
import { matchesNetwork } from '../../domain/asset';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { checkDailyLimit, limitsFor, tierFor } from '../../domain/limits';
import { Withdrawal } from '../../domain/withdrawal';
import type { LedgerDependencies } from '../ports';

export interface RequestWithdrawalCommand {
  readonly userId: UserId;
  readonly asset: string;
  readonly network: string;
  readonly destination: string;
  /** A decimal string, straight from the form. Never a number. */
  readonly amount: string;
}

export interface RequestWithdrawalResult {
  readonly withdrawalId: string;
  readonly amount: string;
  readonly fee: string;
  readonly asset: string;
  readonly approvalsRequired: number;
}

/**
 * A customer asks for money to leave.
 *
 * ── The order of the checks is the design ──────────────────────────────────────
 * Every check below is ordered cheapest-first *and* least-revealing-first, and the
 * two happen to agree. Parsing failures cost nothing and disclose nothing; the
 * balance check touches the database; the limit check needs a price. Running them
 * in the other order would mean a malformed amount cost a price lookup.
 *
 * ── Nothing moves ──────────────────────────────────────────────────────────────
 * This posts no transfer. It places a *hold*, which reserves the amount plus the
 * fee without debiting anything, and records a pending request for an operator to
 * decide on. A rejection then leaves no trace on the customer's statement, because
 * nothing happened — see `Withdrawal` for why that matters.
 *
 * ── It refuses when it cannot price the asset ──────────────────────────────────
 * The daily limit is denominated in USD, so an unpriceable asset is one whose
 * withdrawal cannot be shown to be within the limit. The choice is to let it
 * through unchecked or to stop, and for money leaving a platform there is only one
 * defensible direction to fail.
 */
export function createRequestWithdrawal(deps: LedgerDependencies) {
  return async function requestWithdrawal(
    command: RequestWithdrawalCommand,
  ): Promise<Result<RequestWithdrawalResult, LedgerError>> {
    const asset = deps.assets.find(command.asset);
    if (asset === null) return err(LedgerErrors.assetNotSupported(command.asset));

    const network = asset.networks.find((candidate) => candidate.id === command.network);
    if (network === undefined) {
      return err(LedgerErrors.networkNotSupported(asset.code, command.network));
    }

    const destination = command.destination.trim();
    if (destination.length === 0) {
      return err(LedgerErrors.destinationInvalid('Enter a destination address.'));
    }
    if (!matchesNetwork(network, destination)) {
      // Naming the network is deliberate: the overwhelmingly common mistake is a
      // correct address pasted for the wrong chain, and "invalid address" sends
      // someone hunting for a typo that is not there.
      return err(
        LedgerErrors.destinationInvalid(
          `That does not look like a ${network.label} address for ${asset.code}.`,
        ),
      );
    }

    let amount: Money;
    let fee: Money;
    try {
      amount = Money.fromDecimalString(command.amount.trim(), asset.code, asset.scale);
      fee = Money.fromDecimalString(network.fee, asset.code, asset.scale);
    } catch {
      return err(LedgerErrors.amountInvalid('Enter an amount, for example 0.05.'));
    }

    if (amount.isNegative || amount.isZero) {
      return err(LedgerErrors.amountInvalid('Enter an amount greater than zero.'));
    }

    const minimum = Money.fromDecimalString(asset.minimumWithdrawal, asset.code, asset.scale);
    if (amount.compare(minimum) < 0) {
      return err(LedgerErrors.amountBelowMinimum(asset.minimumWithdrawal, asset.code));
    }

    const owner = userOwner(command.userId);
    const account = await deps.accounts.findOrOpen(owner, asset);
    const total = amount.add(fee);

    // Checked before the price lookup so an obviously unaffordable request does not
    // cost a round trip to the feed.
    if (account.available.compare(total) < 0) {
      return err(
        LedgerErrors.insufficientFunds(account.available.toDecimalString(), asset.code),
      );
    }

    const valuedAtUsd = await deps.prices.valueInUsd(amount);
    if (valuedAtUsd === null) return err(LedgerErrors.valuationUnavailable(asset.code));

    const limits = limitsFor(tierFor());
    const now = deps.clock.now();
    const used = await deps.withdrawals.usedSince(command.userId, startOfDayUtc(now));

    const limit = checkDailyLimit(valuedAtUsd, used, limits);
    if (!limit.allowed) {
      return err(
        LedgerErrors.dailyLimitExceeded(
          limit.remainingUsd.toDecimalString(),
          limit.capUsd.toDecimalString(),
        ),
      );
    }

    const withdrawal = Withdrawal.request({
      id: deps.ids.next(),
      userId: command.userId,
      amount,
      fee,
      network: network.id,
      destination,
      valuedAtUsd,
      now,
    });

    // The hold is placed against the balance that was just read, so the version
    // written here is the one that was checked. A concurrent withdrawal that read
    // the same balance loses the write and its caller sees a concurrency error
    // rather than both requests succeeding against one balance.
    if (!account.hold(total)) {
      return err(
        LedgerErrors.insufficientFunds(account.available.toDecimalString(), asset.code),
      );
    }

    await deps.accounts.saveAccounts([account]);
    await deps.withdrawals.save(withdrawal);

    return ok({
      withdrawalId: withdrawal.id,
      amount: amount.toDecimalString(),
      fee: fee.toDecimalString(),
      asset: asset.code,
      approvalsRequired: valuedAtUsd.compare(limits.dualControlUsd) >= 0 ? 2 : 1,
    });
  };
}

export type RequestWithdrawal = ReturnType<typeof createRequestWithdrawal>;

/**
 * Midnight UTC before `now`.
 *
 * UTC rather than the customer's zone, and the wallet page says so. A limit that
 * reset at local midnight would reset at a different instant for each customer,
 * which is unenforceable across a platform and trivially gamed by anyone willing
 * to change their timezone.
 */
export function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
