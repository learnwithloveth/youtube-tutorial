'use server';

import { MAX_DOCUMENT_BYTES, presentIdentityError } from '@/modules/identity';
import { logger } from '@/platform/observability/logger';
import { recordActivity } from '@/server/activity';
import { identity, requireUser } from '@/server/auth';
import { describeRequest } from '@/server/request-context';
import { isCountryCode } from '@/shared/lib/countries';
import { toUserId } from '@/shared/kernel/ids';

import type { VerifyIdentityFormState } from './form-state';

/**
 * A customer submits their identity document.
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
  const user = await requireUser('/verify-identity');

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
    await recordActivity({
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

  return {
    status: 'submitted',
    message: 'Received. A reviewer will look at it and you will be emailed either way.',
  };
}
