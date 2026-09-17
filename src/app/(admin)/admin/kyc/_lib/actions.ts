'use server';

import { revalidatePath } from 'next/cache';

import { presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { identity, requireAdmin } from '@/server/auth';
import { recordAndPush } from '@/server/push';
import { describeRequest } from '@/server/request-context';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import type { AdjudicationFormState } from './form-state';

/**
 * The KYC queue's write boundary.
 *
 * ── The authorisation check is here, not in the layout ────────────────────────
 * `(admin)/layout.tsx` runs `requireAdmin` and that protects the *page*. It
 * protects nothing here: a Server Action is a public endpoint anyone can invoke
 * directly. So the check is repeated, and the operator id it returns is the one
 * recorded as the adjudicator — never a value from the form, which would make
 * attributing a decision to a colleague a matter of typing an id.
 *
 * ── The trail entry is written against the customer ───────────────────────────
 * "What happened to this account" includes being verified or refused, and an
 * operator opening a disputed account needs to see who decided and when without
 * knowing this table exists. The *reason* is not copied into the trail: it can
 * contain whatever an operator typed about a person's documents, and the audit log
 * is read by everyone with console access. It stays on the verification row, where
 * the people handling that case already are.
 */
export async function decideVerificationAction(
  _previous: AdjudicationFormState,
  formData: FormData,
): Promise<AdjudicationFormState> {
  const operator = await requireAdmin('/admin/kyc');

  const verificationId = String(formData.get('verificationId') ?? '');
  const action = formData.get('decision') === 'reject' ? 'reject' : 'approve';
  const reason = String(formData.get('reason') ?? '');

  if (verificationId === '') {
    return { status: 'error', message: 'That request was not understood.', verificationId: null };
  }

  const result = await identity().decideVerification({
    verificationId,
    decidedBy: operator.id as UserId,
    action,
    reason,
  });

  if (!result.ok) {
    return {
      status: 'error',
      message: presentIdentityError(result.error),
      verificationId,
    };
  }

  const request = await describeRequest();
  try {
    await recordAndPush({
      userId: toUserId(result.value.userId),
      kind: action === 'approve' ? 'verification-approved' : 'verification-rejected',
      reference: result.value.verificationId,
      detail: `by ${operator.email}`,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  } catch {
    // Best-effort, like every other activity write: a decision that succeeded must
    // not become an error page because an audit insert timed out.
    logger.warn({ event: 'verification_trail_write_skipped', module: 'identity' });
  }

  logger.info({
    event: action === 'approve' ? 'verification_approved' : 'verification_rejected',
    module: 'identity',
    verificationId: result.value.verificationId,
    operatorId: operator.id,
  });

  // The queue, the badge in the nav and the command centre all count pending cases.
  revalidatePath('/admin/kyc');
  revalidatePath('/admin');

  return {
    status: 'decided',
    message: action === 'approve' ? 'Verified.' : 'Rejected. The customer is told the reason.',
    verificationId,
  };
}
