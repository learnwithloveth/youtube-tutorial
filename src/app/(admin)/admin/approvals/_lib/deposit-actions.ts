'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { requireAdmin } from '@/server/auth';
import { emailCustomerAbout, getPendingDepositClaims, ledger } from '@/server/ledger';
import { recordAndPush } from '@/server/push';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

import type { DecisionFormState } from './form-state';
import { trimDecimalString } from '@/shared/kernel';

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
    await recordAndPush({
      userId: subject.userId as UserId,
      kind: result.value.status === 'approved' ? 'deposit-recorded' : 'deposit-rejected',
      reference: `${claimId} by ${operator.email}`,
      detail:
        result.value.credited === null
          // No longer says "deposit": the kind does that now, and a detail line
          // repeating the noun was only ever there to correct the wrong one.
          ? `claimed ${trimDecimalString(subject.claimedAmount)} ${subject.asset}`
          : `${trimDecimalString(result.value.credited)} ${subject.asset} credited`,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
      // The operator's decision reaches the customer's devices. The claim they
      // filed themselves, recorded under the same kind, does not.
    });
  }

  // The receipt, or the refusal with its reason. A claim is decided in one step, so
  // every successful decision is final.
  emailCustomerAbout('deposit', claimId);

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
