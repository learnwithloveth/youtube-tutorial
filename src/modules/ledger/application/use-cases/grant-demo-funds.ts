import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { platformOwner, userOwner } from '../../domain/account';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { Transfer } from '../../domain/transfer';
import type { LedgerDependencies } from '../ports';

export interface GrantDemoFundsCommand {
  /** Who receives it. Resolved from an account number or an email by the caller. */
  readonly userId: UserId;
  readonly asset: string;
  /** A decimal string. Never a number. */
  readonly amount: string;
  /**
   * Why, in the operator's words — "Tuesday workshop, group B".
   *
   * Optional, unlike a deposit's reference, and the difference is the point. A
   * deposit's reference is what makes it auditable against something that actually
   * arrived; there is nothing outside this system for a demo grant to be audited
   * against, so requiring one would be asking an operator to invent a fact. The
   * transfer still carries a reference either way — it says who issued it.
   */
  readonly note?: string | undefined;
  /** The operator issuing it. Recorded so the entry has an author. */
  readonly issuedBy: UserId;
}

/**
 * Money conjured for a workshop.
 *
 * ── This is the button `recordDeposit` refuses to be ──────────────────────────
 * `record-deposit.ts` sets out three ways a balance could come into existence and
 * rejects two of them, because a platform that lets anyone credit themselves has
 * made every balance on it fictional. That reasoning is unchanged and this use
 * case does not weaken it. What it does is admit a fourth case the ledger did not
 * have a shape for: a tutor running a class, who needs twenty student accounts to
 * have something in them before anybody can be shown how a withdrawal works.
 *
 * The difference from the button that prints money is not the amount or who may
 * press it. It is that the result is *labelled*, in the ledger, permanently:
 *
 *  - the contra leg is `demo`, not `custody`, so the platform's stated liability
 *    to its customers — the number meant to be backed by real assets — does not
 *    move by a single satoshi (see `domain/account.ts`);
 *  - the transfer's kind is `demo-credit`, not `deposit`, so a customer's own
 *    statement says what it was without anybody having to read a reference;
 *  - the operator who issued it is named in that reference, as with every other
 *    console action that touches money.
 *
 * Nothing here can be mistaken later for funds that arrived. That is the whole
 * design, and it is why this is a separate use case rather than `recordDeposit`
 * with a friendlier form in front of it.
 *
 * ── What it deliberately does not do ──────────────────────────────────────────
 * It does not check a limit, price the amount, or ask a second operator. Those
 * controls exist on the withdrawal path because that is where value leaves; this
 * one credits an account from a contra account that is allowed to go negative, and
 * the only thing at stake in getting it wrong is a workshop with the wrong numbers
 * on the board.
 *
 * It also does not take funds back. A clawback is a second balanced transfer in
 * the other direction and the ledger would have no trouble with one; it is absent
 * because nothing has asked for it, and adding a debit path to a credit tool is
 * how "grant demo funds" becomes "adjust any balance".
 */
export function createGrantDemoFunds(deps: LedgerDependencies) {
  return async function grantDemoFunds(
    command: GrantDemoFundsCommand,
  ): Promise<Result<{ transferId: string; balance: string; asset: string }, LedgerError>> {
    const asset = deps.assets.find(command.asset);
    if (asset === null) return err(LedgerErrors.assetNotSupported(command.asset));

    let amount: Money;
    try {
      amount = Money.fromDecimalString(command.amount.trim(), asset.code, asset.scale);
    } catch {
      return err(LedgerErrors.amountInvalid('Enter an amount, for example 0.05.'));
    }
    if (amount.isNegative || amount.isZero) {
      return err(LedgerErrors.amountInvalid('A demo grant must be for a positive amount.'));
    }

    const account = await deps.accounts.findOrOpen(userOwner(command.userId), asset);
    const source = await deps.accounts.findOrOpen(platformOwner('demo'), asset);

    const note = command.note?.trim() ?? '';
    const transfer = Transfer.create({
      id: deps.ids.next(),
      kind: 'demo-credit',
      occurredAt: deps.clock.now(),
      // The operator is always named; the note is appended only when there is one,
      // so a reference never reads "demo funds  by <id>" with a hole in it.
      reference: note.length > 0
        ? `demo funds (${note}) by ${command.issuedBy}`
        : `demo funds by ${command.issuedBy}`,
      entries: [
        { accountId: account.id, delta: amount },
        { accountId: source.id, delta: amount.negate() },
      ],
    });

    account.applyDelta(amount);
    source.applyDelta(amount.negate());

    await deps.accounts.post(transfer, [account, source]);

    return ok({
      transferId: transfer.id,
      balance: account.balance.toDecimalString(),
      asset: asset.code,
    });
  };
}

export type GrantDemoFunds = ReturnType<typeof createGrantDemoFunds>;
