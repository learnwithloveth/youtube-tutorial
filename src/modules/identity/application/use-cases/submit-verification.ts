import { err, ok, type Result } from '@/shared/kernel';
import { presentImageRejection } from '@/shared/kernel/image-bytes';
import type { UserId } from '@/shared/kernel/ids';

import {
  IdentityVerification,
  inspectDocument,
  isDocumentType,
  MINIMUM_AGE_YEARS,
  MIN_DOCUMENT_NUMBER,
  MIN_FULL_NAME,
} from '../../domain/identity-verification';
import { IdentityErrors, type IdentityError } from '../errors';
import type { IdentityDependencies } from '../ports';

/**
 * A customer submits their identity document for review.
 *
 * ── The bytes are inspected before anything is written ────────────────────────
 * The declared content type is discarded, not cross-checked — cross-checking still
 * leaves the client with a vote. What the file *is* comes from its leading bytes,
 * and a file that is not a real PNG, JPEG or WebP never reaches storage, which is
 * what stops a stored-XSS from being served back to an operator later.
 *
 * ── One pending submission at a time ──────────────────────────────────────────
 * Refused rather than queued. Three submissions from one impatient person are three
 * rows an operator works through to reach the same answer, and each one displaces
 * somebody else in a queue that is deliberately worked oldest-first.
 *
 * ── Order of operations ───────────────────────────────────────────────────────
 * Validate, then store the document, then write the row. The document is written
 * first only because the row references it, which means a failure between the two
 * leaves an orphaned blob rather than a verification pointing at nothing. An
 * orphan is a cleanup job; a dangling reference is a queue entry an operator opens
 * to a broken image and cannot decide.
 */

export interface SubmitVerificationCommand {
  readonly userId: UserId;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly country: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly document: Uint8Array;
}

export interface SubmitVerificationResult {
  readonly verificationId: string;
}

export type SubmitVerification = (
  command: SubmitVerificationCommand,
) => Promise<Result<SubmitVerificationResult, IdentityError>>;

export function createSubmitVerification(deps: IdentityDependencies): SubmitVerification {
  return async function submitVerification(command) {
    const now = deps.clock.now();

    if (command.fullName.trim().length < MIN_FULL_NAME) {
      return err(IdentityErrors.verificationNameRequired());
    }
    if (!/^[A-Za-z]{2}$/.test(command.country.trim())) {
      return err(IdentityErrors.verificationCountryRequired());
    }
    if (command.documentNumber.trim().length < MIN_DOCUMENT_NUMBER) {
      return err(IdentityErrors.verificationDocumentNumberRequired());
    }
    if (!isDocumentType(command.documentType)) {
      // Not a field a person can get wrong — the form is a fixed list — so this is
      // a tampered request, and it gets the same answer as a tampered country.
      return err(IdentityErrors.verificationCountryRequired());
    }

    const inspection = inspectDocument(command.document);
    if (!inspection.ok) {
      return err(
        IdentityErrors.verificationDocumentRejected(
          inspection.rejection.kind === 'unsupported-type'
            ? 'Upload a photo of the document as a PNG, JPEG or WebP. Other formats are not accepted.'
            : presentImageRejection(inspection.rejection),
        ),
      );
    }

    // Read before written, so a second submission while one waits is refused rather
    // than queued. Two requests racing this check can still both pass it; the
    // consequence is one extra row in a human queue, which is the right thing to
    // lose against holding a transaction open across a multi-megabyte upload.
    if (await deps.verifications.hasPending(command.userId)) {
      return err(IdentityErrors.verificationAlreadyPending());
    }

    const history = await deps.verifications.listForUser(command.userId, 20);
    if (history.some((entry) => entry.status === 'approved')) {
      return err(IdentityErrors.verificationAlreadyApproved());
    }

    const documentId = await deps.documents.put(command.document, inspection.contentType);

    let verification: IdentityVerification;
    try {
      verification = IdentityVerification.submit({
        id: deps.verifications.nextId(),
        userId: command.userId,
        fullName: command.fullName,
        dateOfBirth: command.dateOfBirth,
        country: command.country,
        documentType: command.documentType,
        documentNumber: command.documentNumber,
        documentId,
        now,
      });
    } catch {
      // The only check the guards above do not already cover is the date, which the
      // aggregate parses by hand precisely because `new Date('2026-02-31')` would
      // otherwise turn a typo into a plausible birthday.
      return err(IdentityErrors.verificationDateOfBirthInvalid(MINIMUM_AGE_YEARS));
    }

    await deps.verifications.save(verification);
    return ok({ verificationId: verification.id });
  };
}
