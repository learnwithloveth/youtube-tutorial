import {
  inspectImageBytes,
  presentImageRejection,
  type ImageContentType,
  type ImageInspection,
  type ImageRejection,
} from '@/shared/kernel/image-bytes';

/**
 * Validating a file attached to a watch-only wallet.
 *
 * ── What this is for, and what it is not ──────────────────────────────────────
 * A screenshot of the wallet app showing the address, or a hardware-wallet
 * receipt. It gives an operator something to look at when a customer asks about
 * an address they cannot sign for — a lost device, a wallet in a safe.
 *
 * It is **not** proof. A screenshot can be edited by anyone with ten minutes, so
 * attaching one changes nothing about the row: the status stays `watch-only` and
 * `LinkedWallet.proves()` keeps returning false. That invariant is enforced in the
 * aggregate and tested, because the tempting version of this feature — "upload a
 * screenshot and we will mark it verified" — would make the verified badge mean
 * two entirely different things and the weaker one would win.
 *
 * ── The rule is the kernel's; the policy is this context's ────────────────────
 * Deciding what a file *is* from its leading bytes is a statement about bytes and
 * lives in `shared/kernel/image-bytes`, shared with deposit proofs and chat
 * attachments. What is decided here is how large one may be and what a customer is
 * told when theirs is refused. Same arrangement as the ledger's `proof-image.ts`.
 */

export type EvidenceContentType = ImageContentType;
export type EvidenceRejection = ImageRejection;
export type EvidenceInspection = ImageInspection;

/**
 * Largest attachment accepted.
 *
 * One megabyte, half what a deposit proof gets, and the difference is deliberate.
 * A deposit proof is written once per claim; this table grows with *accounts* —
 * up to ten rows each, kept for as long as the wallet is on the list. The same
 * 512 MB budget divided by a much larger denominator buys a smaller cap.
 *
 * A screenshot of a wallet app showing an address is well under it. Anyone hitting
 * this limit is uploading a photograph, and the message says so.
 */
export const MAX_EVIDENCE_BYTES = 1024 * 1024;

export function inspectEvidence(bytes: Uint8Array): EvidenceInspection {
  return inspectImageBytes(bytes, { maxBytes: MAX_EVIDENCE_BYTES });
}

/**
 * What a customer is told when their file is refused.
 *
 * needs to know a screenshot is what is wanted and roughly how big it may be.
 */
export function presentEvidenceRejection(rejection: EvidenceRejection): string {
  if (rejection.kind === 'unsupported-type') {
    return 'Attach a PNG, JPEG or WebP screenshot. Other formats are not accepted.';
  }
  if (rejection.kind === 'too-large') {
    return 'That file is larger than 1MB. A screenshot of the address is plenty — a full photograph is not needed.';
  }
  return presentImageRejection(rejection);
}
