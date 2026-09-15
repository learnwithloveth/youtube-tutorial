'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { requireAdmin } from '@/server/auth';
import { getApprovalQueue, ledger } from '@/server/ledger';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

import type { DecisionFormState } from './form-state';
import { trimDecimalString } from '@/shared/kernel';

/**
 * The approvals queue's write boundary.
 *
 * ── The authorisation check is here, not in the layout ─────────────────────────
 * `(admin)/layout.tsx` runs `requireAdmin` and that protects the *page*. It
 * protects nothing here: a Server Action is a public endpoint that anyone can
 * invoke directly, and this one releases money. So the check is repeated, and the
 * operator id it returns is the one recorded as the approver — never a value from
 * the form, which would make impersonating a second approver a matter of typing an
 * id.
 *
 * That detail is what makes dual control real. Both signatures come from two
 * separately authenticated sessions, and the ledger refuses a second signature
 * from the same operator.
 */

export async function decideWithdrawalAction(
  _previous: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  // Redirects a signed-out caller and 404s a signed-in customer, exactly as the
  // console's pages do.
  const operator = await requireAdmin('/admin/approvals');

  const context = ledger();
  if (context === null) {
    return { status: 'error', message: 'The ledger is unavailable.', withdrawalId: null };
  }

  const withdrawalId = String(formData.get('withdrawalId') ?? '');
  const decision = formData.get('decision') === 'reject' ? 'reject' : 'approve';
  const reason = String(formData.get('reason') ?? '');

  // Read before the decision: afterwards the row is no longer pending and the
  // amount would have to be re-derived for the audit line.
  const queue = await getApprovalQueue();
  const subject = queue.withdrawals.find((candidate) => candidate.id === withdrawalId);

  const result = await context.decideWithdrawal({
    withdrawalId,
    operatorId: operator.id as UserId,
    decision,
    reason,
  });

  if (!result.ok) {
    logger.warn({
      event: 'withdrawal_decision_refused',
      module: 'ledger',
      reason: result.error.kind,
      withdrawalId,
    });
    return {
      status: 'error',
      message: presentLedgerError(result.error),
      withdrawalId,
    };
  }

  if (subject !== undefined && result.value.status !== 'pending') {
    const request = await describeRequest();

    // Recorded against the *customer*, not the operator. The trail answers "what
    // happened to this account", and an approval is something that happened to
    // them; the operator is named in the reference so the decision is still
    // attributable.
    await recordActivity({
      userId: subject.userId as UserId,
      kind: result.value.status === 'approved' ? 'withdrawal-approved' : 'withdrawal-rejected',
      reference: `${withdrawalId} by ${operator.email}`,
      // Trimmed: the DTO carries the stored scale, and an 18-decimal asset
      // turns this line into `1.000000000000000000 ETH` in the customer's bell.
      detail: `${trimDecimalString(subject.amount)} ${subject.asset}`,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  }

  // The queue and the customer's wallet both changed.
  revalidatePath('/admin/approvals');
  revalidatePath('/app/wallet');

  return {
    status: 'decided',
    message:
      result.value.status === 'pending'
        ? `Signature recorded. ${result.value.approvalsHeld} of ${result.value.approvalsRequired} — a second operator must approve before funds move.`
        : result.value.status === 'approved'
          ? 'Approved. Funds have left the customer balance and are queued for payout.'
          : 'Rejected. The hold has been released back to the customer.',
    withdrawalId,
  };
}
