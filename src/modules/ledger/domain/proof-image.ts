/**
 * Validating an uploaded proof image.
 *
 * ── Sniffed, never trusted ─────────────────────────────────────────────────────
 * The filename, the extension and the `Content-Type` the browser sends are all
 * chosen by whoever is uploading. A file called `receipt.png`, declared as
 * `image/png`, containing HTML is the oldest stored-XSS in the book: it gets
 * served back, a browser sniffs it, and script runs on the operator's session —
 * the session that approves payments.
 *
 * So the type is decided by the bytes at the head of the file and nothing else,
 * and the declared type is discarded rather than cross-checked. Cross-checking
 * would still leave the client with a vote.
 *
 * ── SVG is refused outright ────────────────────────────────────────────────────
 * It is a document format that executes script, not an image format, and no amount
 * of sanitising makes it safe to hand back to a browser. Nobody screenshots a
 * deposit as an SVG, so the cost of refusing it is zero and the cost of allowing it
 * is an operator's session.
 */

export type ProofContentType = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Largest proof accepted.
 *
 * Two megabytes is generous for a screenshot and deliberately small for a database
 * column: proofs live in Postgres for now, and the project's free tier is 512 MB
 * in total. The cap is what keeps a feature from consuming the database it lives
 * in — see `PostgresProofStorage` for when to move to object storage.
 */
export const MAX_PROOF_BYTES = 2 * 1024 * 1024;

/** Smallest plausible image. Below this the upload was truncated or empty. */
const MIN_PROOF_BYTES = 64;

export type ProofRejection =
  | { readonly kind: 'too-large'; readonly maxBytes: number }
  | { readonly kind: 'too-small' }
  | { readonly kind: 'unsupported-type' };

export type ProofInspection =
  | { readonly ok: true; readonly contentType: ProofContentType }
  | { readonly ok: false; readonly rejection: ProofRejection };

/**
 * Decides what a file actually is, from its leading bytes.
 *
 * Pure and dependency-free, so it is a domain rule rather than an upload detail —
 * which matters because the same rule has to hold for any future adapter, and for
 * a re-check after the bytes land.
 */
export function inspectProof(bytes: Uint8Array): ProofInspection {
  if (bytes.byteLength > MAX_PROOF_BYTES) {
    return { ok: false, rejection: { kind: 'too-large', maxBytes: MAX_PROOF_BYTES } };
  }
  if (bytes.byteLength < MIN_PROOF_BYTES) {
    return { ok: false, rejection: { kind: 'too-small' } };
  }

  const contentType = sniff(bytes);
  if (contentType === null) {
    return { ok: false, rejection: { kind: 'unsupported-type' } };
  }

  return { ok: true, contentType };
}

function sniff(bytes: Uint8Array): ProofContentType | null {
  // PNG: the eight-byte signature, which includes \r\n and \x1a specifically to
  // catch transfers that mangled line endings.
  if (
    starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'image/png';
  }

  // JPEG: Start-of-Image followed by any marker.
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // WebP is a RIFF container: "RIFF" then four length bytes then "WEBP", so the
  // check has to skip the length rather than match a single contiguous prefix.
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }

  return null;
}

function starts(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** What a customer is told when their file is refused. */
export function presentProofRejection(rejection: ProofRejection): string {
  switch (rejection.kind) {
    case 'too-large':
      return `That file is larger than ${Math.round(rejection.maxBytes / (1024 * 1024))}MB. A screenshot should be well under it.`;
    case 'too-small':
      return 'That file looks empty or was cut off. Try uploading it again.';
    case 'unsupported-type':
      return 'Upload a PNG, JPEG or WebP screenshot. Other formats are not accepted.';
  }
}
