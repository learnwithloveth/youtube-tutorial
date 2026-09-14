import {
  inspectAttachment,
  MAX_ATTACHMENT_BYTES,
  presentAttachmentRejection,
} from '@/modules/support';
import { getCurrentUser } from '@/server/auth';
import { support } from '@/server/support';

/**
 * Stores one image, before the message that references it is sent.
 *
 * ── Two requests, not one ──────────────────────────────────────────────────────
 * Upload, then send. It costs a round trip and buys three things: the widget can
 * show a preview the moment a file is picked, a failed upload does not lose the
 * text somebody typed alongside it, and the message endpoint stays JSON rather
 * than growing a multipart branch.
 *
 * The row is stored unattached and claimed by `postMessage`. An upload that never
 * becomes a message is an orphan a sweep can find — the opposite order would leave
 * a message pointing at bytes that were never stored, which is a broken image in
 * front of a customer.
 *
 * ── The type is decided here, from the bytes ───────────────────────────────────
 * The filename, the extension and the declared `Content-Type` are all chosen by
 * whoever is uploading. `inspectAttachment` reads the file's leading bytes and the
 * declared type is discarded rather than cross-checked — cross-checking would still
 * leave the client with a vote. SVG is refused outright: it executes script, and
 * this image is served back to an operator's session and to the customer's.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) return Response.json({ error: 'not-signed-in' }, { status: 401 });

  const context = support();
  if (context === null) {
    return Response.json({ error: 'support-unavailable' }, { status: 503 });
  }

  // Checked before the body is read, so an oversized upload is refused on the
  // header rather than after it has all been buffered into memory. The real check
  // is still the byte length below — a `Content-Length` is a claim, not a fact.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES * 2) {
    return Response.json({ error: 'That file is too large.' }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
  } catch {
    return Response.json({ error: 'Send the image as form data.' }, { status: 400 });
  }

  if (file === null) return Response.json({ error: 'No image was sent.' }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = inspectAttachment(bytes);
  if (!inspection.ok) {
    return Response.json(
      { error: presentAttachmentRejection(inspection.rejection) },
      { status: 400 },
    );
  }

  const id = context.dependencies.ids.next();
  await context.dependencies.attachments.put({
    id,
    userId: user.id,
    bytes,
    contentType: inspection.contentType,
  });

  return Response.json(
    { attachmentId: id, contentType: inspection.contentType, byteLength: bytes.byteLength },
    { status: 201, headers: { 'cache-control': 'no-store, private' } },
  );
}
