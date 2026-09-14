'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { requireAdmin } from '@/server/auth';
import { getPendingDepositClaims, ledger } from '@/server/ledger';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

import type { DecisionFormState } from './form-state';

/**
 * An operator confirms or refuses a deposit claim.
 *
 * ── The authorisation check is here, not in the layout ─────────────────────────
 * `(admin)/layout.tsx` protects the *page*. It protects nothing here: a Server
 * Action is a public endpoint anyone can invoke directly, and this one credits
 * money onto the platform's books. So the check is repeated, and the operator id
 * recorded is the one it returns — never a value from the form, which would make
 * attributing a credit to somebody else a matter of typing an id.
 */
export async function decideDepositAction(
  _previous: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const operator = await requireAdmin('/admin/approvals');

  const context = ledger();
  if (context === null) {
    return { status: 'error', message: 'The ledger is unavailable.', withdrawalId: null };
  }

  const claimId = String(formData.get('claimId') ?? '');
  const decision = formData.get('decision') === 'reject' ? 'reject' : 'approve';

  // Read before the decision: afterwards the claim is no longer pending and the
  // amount would have to be re-derived for the audit line.
  const queue = await getPendingDepositClaims();
  const subject = queue.find((candidate) => candidate.id === claimId);

  const result = await context.decideDepositClaim({
    claimId,
    operatorId: operator.id as UserId,
    decision,
    creditedAmount: String(formData.get('creditedAmount') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });

  if (!result.ok) {
    logger.warn({
      event: 'deposit_decision_refused',
      module: 'ledger',
      reason: result.error.kind,
      claimId,
    });
    return { status: 'error', message: presentLedgerError(result.error), withdrawalId: claimId };
  }

  if (subject !== undefined) {
    const request = await describeRequest();

    // Recorded against the customer, not the operator: the trail answers "what
    // happened to this account". The operator is named in the reference so the
    // decision stays attributable.
    await recordActivity({
      userId: subject.userId as UserId,
      kind: result.value.status === 'approved' ? 'deposit-recorded' : 'withdrawal-rejected',
      reference: `${claimId} by ${operator.email}`,
      detail:
        result.value.credited === null
          ? `deposit rejected · claimed ${subject.claimedAmount} ${subject.asset}`
          : `${result.value.credited} ${subject.asset} credited`,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  }

  revalidatePath('/admin/approvals');
  revalidatePath('/app/wallet');

  return {
    status: 'decided',
    message:
      result.value.status === 'approved'
        ? `Credited ${result.value.credited}. The customer's balance is updated.`
        : 'Rejected. Nothing was credited and the customer is told why.',
    withdrawalId: claimId,
  };
}
