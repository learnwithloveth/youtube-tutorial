/**
 * What a file actually is, decided from its leading bytes.
 *
 * ── Why this is in the kernel ──────────────────────────────────────────────────
 * Two contexts already accept an uploaded image and a third will: a deposit proof
 * in `ledger`, a chat attachment in `support`, and identity documents whenever KYC
 * exists. The *rule* is identical in all three and carries no domain meaning — it
 * is a statement about bytes, not about money or conversations.
 *
 * Duplicating it would be worse than coupling to it. The failure mode of a second
 * copy is that one of them learns about a new format, or loosens a check, and
 * nobody notices which upload path is now the weak one.
 *
 * ── Sniffed, never trusted ─────────────────────────────────────────────────────
 * The filename, the extension and the `Content-Type` a browser sends are all
 * chosen by whoever is uploading. A file called `receipt.png`, declared as
 * `image/png`, containing HTML is the oldest stored-XSS in the book: it gets served
 * back, a browser sniffs it, and script runs in somebody else's session.
 *
 * So the type is decided by the head of the file and nothing else, and the declared
 * type is discarded rather than cross-checked. Cross-checking would still leave the
 * client with a vote.
 *
 * ── SVG is refused outright ────────────────────────────────────────────────────
 * It is a document format that executes script, not an image format, and no amount
 * of sanitising makes it safe to hand back to a browser. Nobody screenshots
 * anything as an SVG, so the cost of refusing it is zero.
 */

export type ImageContentType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Smallest plausible image. Below this the upload was truncated or empty. */
const MIN_IMAGE_BYTES = 64;

export type ImageRejection =
  | { readonly kind: 'too-large'; readonly maxBytes: number }
  | { readonly kind: 'too-small' }
  | { readonly kind: 'unsupported-type' };

export type ImageInspection =
  | { readonly ok: true; readonly contentType: ImageContentType }
  | { readonly ok: false; readonly rejection: ImageRejection };

/**
 * Pure and dependency-free, so it is a rule rather than an upload detail — which
 * matters because the same rule has to hold for any future adapter, and for a
 * re-check after the bytes have landed.
 *
 * The cap is a parameter rather than a constant: a deposit proof and a chat
 * screenshot are stored in different places with different budgets, and baking one
 * number in here would make the kernel hold a decision that belongs to a context.
 */
export function inspectImageBytes(
  bytes: Uint8Array,
  options: { maxBytes: number },
): ImageInspection {
  if (bytes.byteLength > options.maxBytes) {
    return { ok: false, rejection: { kind: 'too-large', maxBytes: options.maxBytes } };
  }
  if (bytes.byteLength < MIN_IMAGE_BYTES) {
    return { ok: false, rejection: { kind: 'too-small' } };
  }

  const contentType = sniff(bytes);
  if (contentType === null) {
    return { ok: false, rejection: { kind: 'unsupported-type' } };
  }

  return { ok: true, contentType };
}

function sniff(bytes: Uint8Array): ImageContentType | null {
  // PNG: the eight-byte signature, which includes \r\n and \x1a specifically to
  // catch transfers that mangled line endings.
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
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

/** What the person who uploaded it is told. */
export function presentImageRejection(rejection: ImageRejection): string {
  switch (rejection.kind) {
    case 'too-large':
      return `That file is larger than ${Math.round(rejection.maxBytes / (1024 * 1024))}MB. A screenshot should be well under it.`;
    case 'too-small':
      return 'That file looks empty or was cut off. Try uploading it again.';
    case 'unsupported-type':
      return 'Upload a PNG, JPEG or WebP image. Other formats are not accepted.';
  }
}
