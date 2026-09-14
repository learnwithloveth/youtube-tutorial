import {
  inspectImageBytes,
  presentImageRejection,
  type ImageContentType,
  type ImageInspection,
  type ImageRejection,
} from '@/shared/kernel/image-bytes';

/**
 * An image a customer attaches to a support message.
 *
 * ── Stored in Postgres, not in Firestore or Firebase Storage ───────────────────
 * The conversation lives in Firestore because a reply has to arrive while somebody
 * is waiting for it, and a serverless deployment cannot hold a socket. None of
 * that applies to a screenshot: it is written once, read a handful of times, and
 * nobody is watching for it to change.
 *
 * So it goes where the rest of this application's data is, beside the deposit
 * proofs, under the same authorised-route pattern. That also keeps the bytes off a
 * second billing surface and out of a second backup story — and it is what the
 * Firestore document carries instead: an id, not an image.
 *
 * ── The same sniffing as every other upload ────────────────────────────────────
 * `inspectImageBytes` decides the type from the leading bytes and refuses SVG
 * outright. The difference here is who sees the result: a deposit proof is opened
 * by an operator, and a chat attachment is opened by an operator *and* re-served to
 * the customer — so the same rule protects two sessions instead of one.
 */

export type AttachmentContentType = ImageContentType;
export type AttachmentRejection = ImageRejection;
export type AttachmentInspection = ImageInspection;

/**
 * Largest attachment accepted.
 *
 * Two megabytes, matching a deposit proof, and for the same reason: these are rows
 * in a Postgres database whose free tier is 512 MB in total. A phone photograph
 * will exceed it; a screenshot of the problem — which is what a support thread
 * actually needs — will not.
 */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export function inspectAttachment(bytes: Uint8Array): AttachmentInspection {
  return inspectImageBytes(bytes, { maxBytes: MAX_ATTACHMENT_BYTES });
}

/** What the person who attached it is told. */
export function presentAttachmentRejection(rejection: AttachmentRejection): string {
  return rejection.kind === 'too-large'
    ? 'That image is larger than 2MB. A screenshot of the problem is usually well under it.'
    : presentImageRejection(rejection);
}
