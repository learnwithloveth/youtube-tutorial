import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { LedgerErrors, type LedgerError } from '../../domain/errors';
import type { LedgerDependencies } from '../ports';

export interface MarkDepositConfirmingCommand {
  readonly claimId: string;
  /** The operator saying so. Never taken from the form. */
  readonly operatorId: UserId;
  /**
   * What they are waiting for, in their words — "3 of 6 confirmations, ~20 min".
   *
   * Optional. The status alone already says more than the customer had before, and
   * requiring a sentence would mean an operator inventing one to get past the
   * field. When it is written it is shown to the customer verbatim.
   */
  readonly note?: string | undefined;
}

/**
 * An operator says a deposit is real and the chain is what is being waited on.
 *
 * ── Why this is a use case and not a third branch of `decideDepositClaim` ─────
 * That one is named for what it does, and this is not a decision: no transfer is
 * posted, no balance moves, `decidedAt` stays null, and the claim stays in the
 * operator's queue to be approved or rejected later. Folding it in would have a
 * function called `decide` reach a path where nothing is decided, and the
 * `decision` union would stop being a list of outcomes.
 *
 * ── What it is actually for ───────────────────────────────────────────────────
 * Between a customer sending a transaction and the platform being willing to
 * credit it there is a real wait, and before this the customer could not see the
 * difference between "nobody has looked yet" and "we have looked, the chain is
 * slow". Those want different responses — the first is a queue problem, the second
 * is just how blockchains work — and a single "pending" told them neither.
 *
 * ── It moves nothing, which is why it is cheap ────────────────────────────────
 * No amount is read, no price is needed, no second operator is asked. The only
 * thing it can get wrong is telling a customer to keep waiting for something that
 * will be refused, and the claim can still be rejected from here with its reason.
 */
export function createMarkDepositConfirming(deps: LedgerDependencies) {
  return async function markDepositConfirming(
    command: MarkDepositConfirmingCommand,
  ): Promise<Result<{ status: 'confirming'; note: string | null }, LedgerError>> {
    const claim = await deps.claims.find(command.claimId);
    if (claim === null) return err(LedgerErrors.depositClaimNotFound(command.claimId));

    // Anything that is not `pending` is either already marked or already settled,
    // and both are things an operator should be told rather than silently allowed
    // to redo — re-marking would overwrite the timestamp that says how long this
    // has been waiting, which is the one figure the state exists to carry.
    if (claim.status !== 'pending') {
      return err(LedgerErrors.withdrawalAlreadyDecided(claim.status));
    }

    claim.markConfirming(command.operatorId, command.note ?? '', deps.clock.now());
    await deps.claims.save(claim);

    return ok({ status: 'confirming', note: claim.confirmingNote });
  };
}

export type MarkDepositConfirming = ReturnType<typeof createMarkDepositConfirming>;
