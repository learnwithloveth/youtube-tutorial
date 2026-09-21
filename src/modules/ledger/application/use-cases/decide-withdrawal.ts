import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { platformOwner, userOwner } from '../../domain/account';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { APPROVALS_REQUIRED } from '../../domain/approvals';
import { derivedTransactionHash } from '../../domain/chain-reference';
import { Transfer } from '../../domain/transfer';
import type { LedgerDependencies } from '../ports';

export interface DecideWithdrawalCommand {
  readonly withdrawalId: string;
  /** The operator making the call. Never taken from the form. */
  readonly operatorId: UserId;
  readonly decision: 'approve' | 'reject';
  /** Required on a rejection; the customer is shown it. */
  readonly reason?: string | undefined;
}

export interface DecideWithdrawalResult {
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly approvalsHeld: number;
  readonly approvalsRequired: number;
}

/**
 * An operator decides on a withdrawal.
 *
 * ── Approving is where money actually moves ────────────────────────────────────
 * Everything up to here was a reservation. On the final approval a balanced
 * transfer is posted:
 *
 *   user account        −(amount + fee)
 *   platform payable    +amount
 *   platform fees       +fee
 *
 * and the hold is released in the same write, because the reservation has been
 * consumed by the debit it was reserving for. Releasing without debiting would
 * hand the money back; debiting without releasing would reserve it twice.
 *
 * `payable` rather than "gone" is the honest state: the money has left the
 * customer and has not yet left the platform. A system that marked it settled at
 * approval time would be asserting a broadcast that has not happened — and the
 * broadcast is the part this application does not do, because there is no chain
 * client behind it.
 *
 * ── Rejecting moves nothing ────────────────────────────────────────────────────
 * The hold is released and the request is closed with a reason. No transfer is
 * posted, because nothing happened, and the customer's statement should say so by
 * being empty.
 */
export function createDecideWithdrawal(deps: LedgerDependencies) {
  return async function decideWithdrawal(
    command: DecideWithdrawalCommand,
  ): Promise<Result<DecideWithdrawalResult, LedgerError>> {
    const withdrawal = await deps.withdrawals.find(command.withdrawalId);
    if (withdrawal === null) {
      return err(LedgerErrors.withdrawalNotFound(command.withdrawalId));
    }
    if (withdrawal.status !== 'pending') {
      return err(LedgerErrors.withdrawalAlreadyDecided(withdrawal.status));
    }

    const asset = deps.assets.find(withdrawal.asset);
    if (asset === null) {
      // The asset was delisted between the request and the decision. Refusing is
      // the only safe move: the ledger can no longer say what scale the amount is
      // in, and paying it out would be guessing.
      return err(LedgerErrors.assetNotSupported(withdrawal.asset));
    }

    const owner = userOwner(withdrawal.userId);
    const account = await deps.accounts.findOrOpen(owner, asset);
    const now = deps.clock.now();

    if (command.decision === 'reject') {
      const reason = command.reason?.trim() ?? '';
      if (reason.length === 0) {
        return err(LedgerErrors.approvalRefused('A rejection needs a reason.'));
      }

      withdrawal.reject(command.operatorId, reason, now);
      account.release(withdrawal.totalReserved);

      await deps.accounts.saveAccounts([account]);
      await deps.withdrawals.save(withdrawal);

      return ok({ status: 'rejected', approvalsHeld: 0, approvalsRequired: 0 });
    }

    // One signature, whatever the amount. Dual control above a USD threshold is
    // gone, so `complete` is true on the first approval every time and the
    // `!complete` branch below is now unreachable in practice — it is kept because
    // `Withdrawal.approve` still owns the counting.
    const required = APPROVALS_REQUIRED;

    let complete: boolean;
    try {
      complete = withdrawal.approve(command.operatorId, required, now);
    } catch (error) {
      // Self-approval and double-approval are refusals an operator must see, not
      // crashes. The domain raises them because they are rule violations; here is
      // where they become something the console can render.
      return err(
        LedgerErrors.approvalRefused(
          error instanceof Error ? error.message : 'This approval was refused.',
        ),
      );
    }

    if (!complete) {
      // One signature recorded, another still needed. Nothing moves yet, and the
      // hold stays exactly where it was.
      await deps.withdrawals.save(withdrawal);
      return ok({
        status: 'pending',
        approvalsHeld: withdrawal.approvals.length,
        approvalsRequired: required,
      });
    }

    const payable = await deps.accounts.findOrOpen(platformOwner('payable'), asset);
    const fees = await deps.accounts.findOrOpen(platformOwner('fees'), asset);

    // Taken first, because the chain reference is derived from it.
    const transferId = deps.ids.next();
    const network = asset.networks.find((option) => option.id === withdrawal.network);

    const transfer = Transfer.create({
      id: transferId,
      kind: 'withdrawal',
      occurredAt: now,
      reference: `withdrawal ${withdrawal.id}`,
      network: withdrawal.network,
      // Derived, not broadcast. Approval moves the money to `payable` and nothing
      // sends it — there is no chain client here — so this names a transaction
      // that does not exist on any network. It is here because a teaching
      // deployment's statement has to read like the real thing; see
      // `chain-reference.ts` for the full cost of that decision.
      txHash: derivedTransactionHash(transferId, network?.txHashPrefix ?? ''),
      entries: [
        { accountId: account.id, delta: withdrawal.totalReserved.negate() },
        { accountId: payable.id, delta: withdrawal.amount },
        { accountId: fees.id, delta: withdrawal.fee },
      ],
    });

    // Release before applying the debit: the reservation exists to stop the balance
    // being spent twice, and the debit is the spend it was reserving for. Applying
    // the debit first would briefly make `available` negative.
    account.release(withdrawal.totalReserved);
    account.applyDelta(withdrawal.totalReserved.negate());
    payable.applyDelta(withdrawal.amount);
    fees.applyDelta(withdrawal.fee);

    await deps.accounts.post(transfer, [account, payable, fees]);
    await deps.withdrawals.save(withdrawal);

    return ok({
      status: 'approved',
      approvalsHeld: withdrawal.approvals.length,
      approvalsRequired: required,
    });
  };
}

export type DecideWithdrawal = ReturnType<typeof createDecideWithdrawal>;
