import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { platformOwner, userOwner } from '../../domain/account';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { derivedTransactionHash } from '../../domain/chain-reference';
import { Transfer } from '../../domain/transfer';
import type { LedgerDependencies } from '../ports';

export interface RecordDepositCommand {
  readonly userId: UserId;
  readonly asset: string;
  /** A decimal string. Never a number. */
  readonly amount: string;
  /**
   * Where this came from, in the operator's words — a transaction hash, a bank
   * reference, a ticket number.
   *
   * Required, and the reason is the whole shape of this use case. A credit with no
   * external reference is indistinguishable from money invented at a console, and
   * the reference is what makes it auditable against the thing that actually
   * arrived.
   */
  readonly reference: string;
  /** The operator crediting it. Recorded so the entry has an author. */
  readonly recordedBy: UserId;
}

/**
 * Money arrives.
 *
 * ── Why this is operator-driven, and what that costs ───────────────────────────
 * On a real exchange a deposit originates outside the application: a chain
 * listener sees a confirmed transaction, or a banking partner posts a settlement
 * webhook. This platform has neither — there is no node and no payment provider
 * behind it — so there is no event to react to.
 *
 * There were three options and only one of them is honest:
 *
 *  1. Let the customer "deposit" from the UI, crediting themselves. That is not a
 *     deposit, it is a button that prints money, and shipping it would make every
 *     balance on the platform fictional.
 *  2. Simulate arrivals on a timer. Same result, slower, and harder to notice.
 *  3. Require an operator to record what actually arrived, against a reference.
 *
 * This is the third. The cost is real and worth stating: deposits are manual, and
 * the wallet's deposit tab shows an address and an instruction rather than a form
 * that credits anything. When a chain listener or a banking webhook exists, it
 * calls exactly this use case with the transaction hash as the reference, and
 * nothing else in the ledger changes.
 *
 * ── The contra account ─────────────────────────────────────────────────────────
 * The customer is credited and `custody` is debited by the same amount, so the
 * books balance. Custody's balance is therefore negative and its magnitude is the
 * platform's total liability to its customers — the number that must be backed by
 * what is actually held on chain and in the bank.
 */
export function createRecordDeposit(deps: LedgerDependencies) {
  return async function recordDeposit(
    command: RecordDepositCommand,
  ): Promise<Result<{ transferId: string; balance: string }, LedgerError>> {
    const asset = deps.assets.find(command.asset);
    if (asset === null) return err(LedgerErrors.assetNotSupported(command.asset));

    const reference = command.reference.trim();
    if (reference.length === 0) {
      return err(
        LedgerErrors.amountInvalid('A deposit needs a reference — a transaction hash or a bank reference.'),
      );
    }

    let amount: Money;
    try {
      amount = Money.fromDecimalString(command.amount.trim(), asset.code, asset.scale);
    } catch {
      return err(LedgerErrors.amountInvalid('Enter an amount, for example 0.05.'));
    }
    if (amount.isNegative || amount.isZero) {
      return err(LedgerErrors.amountInvalid('A deposit must be for a positive amount.'));
    }

    const account = await deps.accounts.findOrOpen(userOwner(command.userId), asset);
    const custody = await deps.accounts.findOrOpen(platformOwner('custody'), asset);

    const transferId = deps.ids.next();
    // No network on this command, so no chain to take a prefix from. Bare hex is
    // the shape three of the four listed chains use, and the one this falls back
    // to rather than guessing Ethereum.
    const transfer = Transfer.create({
      id: transferId,
      kind: 'deposit',
      occurredAt: deps.clock.now(),
      reference: `deposit ${reference} by ${command.recordedBy}`,
      // The network stays null: this command does not carry one, and guessing a
      // chain is a different and worse thing than deriving a reference on a chain
      // somebody named. The chain listener this use case was written for knows it
      // and will pass it.
      //
      // `reference` is deliberately not reused as the hash — it may be a bank
      // reference or a ticket number, and there is no way to tell from here, so
      // putting it in a column called `tx_hash` is how a statement starts lying
      // quietly. The derived value is at least honestly labelled as derived.
      network: null,
      txHash: derivedTransactionHash(transferId, ''),
      entries: [
        { accountId: account.id, delta: amount },
        { accountId: custody.id, delta: amount.negate() },
      ],
    });

    account.applyDelta(amount);
    custody.applyDelta(amount.negate());

    await deps.accounts.post(transfer, [account, custody]);

    return ok({ transferId: transfer.id, balance: account.balance.toDecimalString() });
  };
}

export type RecordDeposit = ReturnType<typeof createRecordDeposit>;
