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

interface QueuedClaim {
  readonly id: string;
  readonly userId: string;
  readonly asset: string;
  readonly claimedAmount: string;
}

/**
 * Marks a claim as waiting on the chain.
 *
 * ── No email, deliberately ────────────────────────────────────────────────────
 * A decision sends one because it is final and the customer has to be able to
 * read it later. This is an interim state that may be followed by another within
 * the hour, and mailing every step of a wait is how a platform teaches people to
 * filter its address. The bell and the push notification carry it instead, and the
 * wallet shows the note for as long as it applies.
 */
async function markConfirming(input: {
  claimId: string;
  operator: { id: string; email: string };
  note: string;
  subject: QueuedClaim | undefined;
}): Promise<DecisionFormState> {
  const context = ledger();
  if (context === null) {
    return { status: 'error', message: 'The ledger is unavailable.', withdrawalId: null };
  }

  const result = await context.markDepositConfirming({
    claimId: input.claimId,
    operatorId: input.operator.id as UserId,
    note: input.note,
  });

  if (!result.ok) {
    logger.warn({
      event: 'deposit_confirming_refused',
      module: 'ledger',
      reason: result.error.kind,
      claimId: input.claimId,
    });
    return {
      status: 'error',
      message: presentLedgerError(result.error),
      withdrawalId: input.claimId,
    };
  }

  if (input.subject !== undefined) {
    const request = await describeRequest();

    await recordAndPush({
      userId: input.subject.userId as UserId,
      kind: 'deposit-confirming',
      reference: `${input.claimId} by ${input.operator.email}`,
      detail:
        result.value.note ??
        `${trimDecimalString(input.subject.claimedAmount)} ${input.subject.asset} awaiting confirmations`,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  }

  // The queue still holds it — it is undecided — but its row and the customer's
  // wallet both read differently now.
  revalidatePath('/admin/approvals');
  revalidatePath('/app/wallet');

  return {
    status: 'decided',
    message:
      'Marked pending on the network. The customer now sees it as Pending, with your note under it. Nothing has been credited, and it stays in this queue until you approve or reject it.',
    withdrawalId: input.claimId,
  };
}

/**
 * An operator credits, refuses, or marks a deposit claim as pending on the chain.
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
  const submitted = String(formData.get('decision') ?? '');

  // Read before anything is written: afterwards the claim has moved on and the
  // amount would have to be re-derived for the audit line.
  const queue = await getPendingDepositClaims();
  const subject = queue.find((candidate) => candidate.id === claimId);

  // Parked, not decided. Handled before the approve/reject split rather than as a
  // third branch of it, because nothing below this point applies: no amount is
  // credited, no receipt is owed, and the claim stays in the queue.
  if (submitted === 'confirming') {
    return markConfirming({
      claimId,
      operator,
      note: String(formData.get('reason') ?? ''),
      subject,
    });
  }

  const decision = submitted === 'reject' ? 'reject' : 'approve';

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
