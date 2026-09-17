'use server';

import { revalidatePath } from 'next/cache';

import { presentLedgerError, MAX_PROOF_BYTES } from '@/modules/ledger';
import { logger } from '@/platform/observability/logger';
import { recordForAdmins } from '@/server/admin-alerts';
import { getCurrentUser } from '@/server/auth';
import { ledger } from '@/server/ledger';
import { describeRequest } from '@/server/request-context';
import type { UserId } from '@/shared/kernel/ids';

import type { DepositFormState } from './form-state';
import { trimDecimalString } from '@/shared/kernel';

/**
 * Submitting proof that funds were sent.
 *
 * ── Nothing here trusts the upload ─────────────────────────────────────────────
 * The file's name, its extension and the `Content-Type` the browser attached are
 * all chosen by whoever is uploading. None of them is read. The bytes go to the
 * ledger, which decides what the file is from its leading bytes and refuses
 * anything that is not a PNG, JPEG or WebP.
 *
 * The size is checked here as well as there, because the cheap check should happen
 * before megabytes are read into memory — but the check that counts is the one in
 * the domain, which runs on the bytes that were actually received.
 */
export async function submitDepositAction(
  _previous: DepositFormState,
  formData: FormData,
): Promise<DepositFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'Sign in to submit a deposit.' };

  const context = ledger();
  if (context === null) {
    return { status: 'error', message: 'Deposits are unavailable right now.' };
  }

  const file = formData.get('proof');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Attach a screenshot of your transfer.' };
  }
  if (file.size > MAX_PROOF_BYTES) {
    return {
      status: 'error',
      message: `That file is larger than ${Math.round(MAX_PROOF_BYTES / (1024 * 1024))}MB.`,
    };
  }

  const result = await context.submitDepositClaim({
    userId: user.id as UserId,
    asset: String(formData.get('asset') ?? ''),
    network: String(formData.get('network') ?? ''),
    // A string all the way down; parsing to a number here would defeat every
    // precaution the ledger takes below it.
    amount: String(formData.get('amount') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    proof: new Uint8Array(await file.arrayBuffer()),
  });

  if (!result.ok) {
    logger.info({ event: 'deposit_claim_rejected', module: 'ledger', reason: result.error.kind });
    return { status: 'error', message: presentLedgerError(result.error) };
  }

  const request = await describeRequest();
  // Recorded for operators as well: a claim is waiting on one of them to confirm it.
  await recordForAdmins({
    userId: user.id as UserId,
    kind: 'deposit-recorded',
    reference: result.value.claimId,
    // Trimmed like the operator's side of the same claim, so the two lines in
    // a dispute read alike rather than one padded and one not.
    detail: `claimed ${trimDecimalString(String(formData.get('amount') ?? ''))} ${formData.get('asset')}`,
    location: request.location,
    agent: request.agent,
    ipDigest: request.ipDigest,
  });

  revalidatePath('/app/wallet');

  return {
    status: 'submitted',
    message:
      'Submitted for review. Your balance updates once an operator confirms the transaction on chain.',
  };
}
