import { describe, expect, it } from 'vitest';

import { inspectProof, MAX_PROOF_BYTES } from '../proof-image';

/**
 * What a file *is*, decided from its bytes.
 *
 * The attack these tests describe is concrete: an operator opens a deposit proof
 * in the console, and the console's session is the one that approves payments. A
 * file trusted because it was called `.png` is how script ends up running there.
 */

/** Pads a signature out past the minimum length so size is not what is tested. */
function file(signature: readonly number[], length = 512): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(signature, 0);
  return bytes;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];

function webp(): Uint8Array {
  const bytes = new Uint8Array(512);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP", after the four length bytes
  return bytes;
}

describe('accepting real images', () => {
  it('recognises PNG, JPEG and WebP from their signatures', () => {
    expect(inspectProof(file(PNG))).toEqual({ ok: true, contentType: 'image/png' });
    expect(inspectProof(file(JPEG))).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(inspectProof(webp())).toEqual({ ok: true, contentType: 'image/webp' });
  });

  /* WebP is a RIFF container: the "WEBP" tag sits at offset 8, after four length
     bytes. A contiguous prefix match would miss it, and a bare "RIFF" check would
     accept a WAV file as an image. */
  it('does not accept a RIFF container that is not WebP', () => {
    const wav = new Uint8Array(512);
    wav.set([0x52, 0x49, 0x46, 0x46], 0);
    wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

    expect(inspectProof(wav).ok).toBe(false);
  });
});

describe('refusing everything else', () => {
  /* The stored-XSS case. This is HTML, it would be called `receipt.png`, and the
     browser would have been told `image/png` — none of which is consulted. */
  it('refuses HTML regardless of what it is named or declared as', () => {
    const html = new TextEncoder().encode(
      `<html><script>fetch('/api/x')</script>${'<!-- pad -->'.repeat(40)}</html>`,
    );

    const result = inspectProof(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('unsupported-type');
  });

  /* SVG is a document format that executes script, not an image format. No amount
     of sanitising makes it safe to hand back to a browser, and nobody screenshots
     a bank transfer as an SVG — so the cost of refusing it is nothing. */
  it('refuses SVG', () => {
    const svg = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>${' '.repeat(200)}</svg>`,
    );

    expect(inspectProof(svg).ok).toBe(false);
  });

  it('refuses a PDF, which is not an image even though it renders like one', () => {
    expect(inspectProof(file([0x25, 0x50, 0x44, 0x46])).ok).toBe(false);
  });

  /* A polyglot: valid PNG header, script in the body. Sniffing cannot catch this —
     it is a real PNG — which is why the defence that matters is the response
     headers on the way back out, not this function. The test records that limit
     rather than implying the sniff is sufficient on its own. */
  it('accepts a PNG whose body contains script, because sniffing cannot see that', () => {
    const payload = new TextEncoder().encode('<script>alert(1)</script>');
    const polyglot = new Uint8Array(512);
    polyglot.set(PNG, 0);
    polyglot.set(payload, 8);

    expect(inspectProof(polyglot)).toEqual({ ok: true, contentType: 'image/png' });
  });
});

describe('size', () => {
  it('refuses anything over the cap', () => {
    const huge = new Uint8Array(MAX_PROOF_BYTES + 1);
    huge.set(PNG, 0);

    const result = inspectProof(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('too-large');
  });

  it('refuses a truncated or empty upload', () => {
    const result = inspectProof(new Uint8Array(PNG));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('too-small');
  });

  /* The cap is checked before the signature: an oversized file should cost a length
     comparison, not a scan. */
  it('rejects an oversized file as too-large rather than as the wrong type', () => {
    const huge = new Uint8Array(MAX_PROOF_BYTES + 1); // no signature at all
    const result = inspectProof(huge);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('too-large');
  });
});
