import {
  inspectImageBytes,
  presentImageRejection,
  type ImageContentType,
  type ImageInspection,
  type ImageRejection,
} from '@/shared/kernel/image-bytes';

/**
 * Validating an uploaded deposit proof.
 *
 * ── The sniffing moved to the kernel; the policy stayed here ───────────────────
 * Deciding what a file *is* from its leading bytes is a statement about bytes with
 * no domain meaning, and three contexts need the identical rule — so it lives in
 * `shared/kernel/image-bytes`. What is left in this file is the ledger's own
 * decision: how large a proof may be, and what a *customer* is told when theirs is
 * refused.
 *
 * The names are kept because they are this context's vocabulary. A call site here
 * reads `inspectProof`, not `inspectImageBytes` — and if the ledger ever needs a
 * rule the others do not, this is the file that grows it.
 */

export type ProofContentType = ImageContentType;
export type ProofRejection = ImageRejection;
export type ProofInspection = ImageInspection;

/**
 * Largest proof accepted.
 *
 * Two megabytes is generous for a screenshot and deliberately small for a database
 * column: proofs live in Postgres for now, and the project's free tier is 512 MB
 * in total. The cap is what keeps a feature from consuming the database it lives
 * in — see `PostgresProofStorage` for when to move to object storage.
 */
export const MAX_PROOF_BYTES = 2 * 1024 * 1024;

export function inspectProof(bytes: Uint8Array): ProofInspection {
  return inspectImageBytes(bytes, { maxBytes: MAX_PROOF_BYTES });
}

/**
 * What a customer is told when their file is refused.
 *
 * Worded for this context: somebody uploading evidence that money arrived, who
 * needs to know it is a screenshot that is wanted.
 */
export function presentProofRejection(rejection: ProofRejection): string {
  return rejection.kind === 'unsupported-type'
    ? 'Upload a PNG, JPEG or WebP screenshot. Other formats are not accepted.'
    : presentImageRejection(rejection);
}
