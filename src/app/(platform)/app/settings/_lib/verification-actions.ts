'use server';

import { revalidatePath } from 'next/cache';

import { MAX_DOCUMENT_BYTES, presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { recordForAdmins } from '@/server/admin-alerts';
import { identity, requireUser } from '@/server/auth';
import { describeRequest } from '@/server/request-context';
import { isCountryCode } from '@/shared/lib/countries';
import { toUserId } from '@/shared/kernel/ids';

import type { VerifyIdentityFormState } from './form-state';

/**
 * A customer submits their identity document.
 *
 * ── Started from Settings, not from sign-up ───────────────────────────────────
 * This used to be a sign-up step at `/verify-identity` with no way past it. Signing
 * up now ends in the application, and the account holder starts this from the
 * Verification tab whenever they choose. Nothing on an account waits on the
 * outcome today; if a withdrawal ever does, that gate belongs on the withdrawal,
 * not on sign-up.
 *
 * ── The action re-derives its own authority ───────────────────────────────────
 * A Server Action is a public endpoint. The page that rendered this form protects
 * nothing, so the session is read again here — and the submission is filed against
 * *that* session's account, never against a user id from the form. A hidden field
 * carrying the owner would make submitting documents on somebody else's behalf a
 * matter of editing the DOM.
 *
 * ── The size check happens twice, deliberately ────────────────────────────────
 * Once here, on the `File` before its bytes are read, so a 200 MB upload is
 * refused without being pulled into memory first. Once again inside the use case,
 * on the bytes themselves, because that is the check a future caller — an API, a
 * mobile client — also has to pass. The first is a resource guard; the second is
 * the rule.
 */
export async function submitVerificationAction(
  _previous: VerifyIdentityFormState,
  formData: FormData,
): Promise<VerifyIdentityFormState> {
  const user = await requireUser('/app/settings?tab=verification');

  const document = formData.get('document');
  if (!(document instanceof File) || document.size === 0) {
    return { status: 'error', message: 'Attach a photo of your document.' };
  }
  if (document.size > MAX_DOCUMENT_BYTES) {
    return {
      status: 'error',
      message: `That file is larger than ${Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const country = String(formData.get('country') ?? '');
  if (!isCountryCode(country)) {
    return { status: 'error', message: 'Choose the country that issued the document.' };
  }

  const result = await identity().submitVerification({
    userId: user.id,
    fullName: String(formData.get('fullName') ?? ''),
    dateOfBirth: String(formData.get('dateOfBirth') ?? ''),
    country,
    documentType: String(formData.get('documentType') ?? ''),
    documentNumber: String(formData.get('documentNumber') ?? ''),
    document: new Uint8Array(await document.arrayBuffer()),
  });

  if (!result.ok) {
    return { status: 'error', message: presentIdentityError(result.error) };
  }

  const request = await describeRequest();
  try {
    // Recorded for operators as well: submitted documents wait in the KYC queue.
    await recordForAdmins({
      userId: toUserId(user.id),
      kind: 'verification-submitted',
      reference: result.value.verificationId,
      // No name, no document number, no country. The trail is read by everybody
      // with console access, and what was submitted belongs on the case.
      detail: null,
      location: request.location,
      agent: request.agent,
      ipDigest: request.ipDigest,
    });
  } catch {
    logger.warn({ event: 'verification_trail_write_skipped', module: 'identity' });
  }

  logger.info({
    event: 'verification_submitted',
    module: 'identity',
    verificationId: result.value.verificationId,
  });

  // The tab re-renders as "under review", and the overview drops its prompt.
  revalidatePath('/app/settings');
  revalidatePath('/app');

  return {
    status: 'submitted',
    // "You will be emailed either way" was false: nothing sends mail about a
    // decision. The decision is written to the activity trail, and the bell shows
    // it as "Identity verified" or "Identity verification refused".
    message: 'Received. A reviewer will look at it and you will be notified either way.',
  };
}
