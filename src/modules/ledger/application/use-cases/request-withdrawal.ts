import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { userOwner } from '../../domain/account';
import { matchesNetwork, requiresGasToken } from '../../domain/asset';
import { APPROVALS_REQUIRED } from '../../domain/approvals';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
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
 * balance check touches the database. Running them in the other order would mean a
 * malformed amount cost a database round trip.
 *
 * What is left is only what has to be true for the request to be *executable*: a
 * supported asset on a supported network, an address that belongs to that network,
 * an amount that parses and is greater than zero, a balance that covers it, and
 * gas to move it. Every policy ceiling that used to sit alongside them is gone —
 * there is no per-asset minimum, no daily allowance in USD, and no size above
 * which a second operator has to sign.
 *
 * ── Nothing moves ──────────────────────────────────────────────────────────────
 * This posts no transfer. It places a *hold*, which reserves the amount plus the
 * fee without debiting anything, and records a pending request for an operator to
 * decide on. A rejection then leaves no trace on the customer's statement, because
 * nothing happened — see `Withdrawal` for why that matters.
 *
 * ── An unpriceable asset no longer blocks the request ──────────────────────────
 * It used to: the daily cap was denominated in USD, so a withdrawal with no price
 * could not be shown to be inside it and was refused. With the cap gone the price
 * decides nothing, and refusing over a quiet feed would be stopping a withdrawal
 * for the sake of a check that no longer exists. The valuation is still recorded
 * when there is one, because the statement and the operator queue read it —
 * `Withdrawal.valuedAtUsd` is nullable for exactly this case.
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

    // No per-asset minimum is enforced. `asset.minimumWithdrawal` is still in the
    // catalogue because the network fee makes a dust withdrawal pointless, but
    // pointless is the customer's call, not a rule this refuses on.

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

    /*
     * A token cannot pay its own network fee.
     *
     * USDT on Ethereum is moved by an Ethereum transaction, and Ethereum charges
     * but USDT has a balance that cannot leave, and until now the request was
     * accepted, held, queued, and only discovered to be unsendable by the operator
     * who tried to send it — or worse, not discovered at all.
     *
     * Checked here rather than at approval time because the answer does not need
     * an operator: it is a fact about the customer's own balances, and telling
     * them at the form is the difference between "add some ETH" and a rejection
     * they cannot interpret days later.
     *
     * Any positive balance passes. The exact fee is the chain's to decide at
     * broadcast time and this platform does not hold the customer's gas — what is
     * being caught is the case of *none at all*, which is the one that is
     * unambiguously fatal.
     */
    if (requiresGasToken(asset, network)) {
      const held = await deps.accounts.listForOwner(owner);
      const gas = held.find((candidate) => candidate.asset === network.nativeAsset);

      if (gas === undefined || gas.available.isZero || gas.available.isNegative) {
        return err(
          LedgerErrors.gasTokenRequired({
            nativeAsset: network.nativeAsset,
            asset: asset.code,
            network: network.label,
          }),
        );
      }
    }

    // Recorded, not gating. Null is a fine outcome — nothing below reads it to
    // decide whether the withdrawal may proceed.
    const valuedAtUsd = await deps.prices.valueInUsd(amount);
    const now = deps.clock.now();

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
      approvalsRequired: APPROVALS_REQUIRED,
    });
  };
}

export type RequestWithdrawal = ReturnType<typeof createRequestWithdrawal>;

/*
 * `startOfDayUtc` used to live here: the daily allowance reset at midnight UTC and
 * both this use case and the wallet query needed the same instant. Nothing counts
 * a day any more, so it is gone with the allowance.
 */
