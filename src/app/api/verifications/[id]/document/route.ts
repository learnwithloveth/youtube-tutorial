import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { getVerificationDocument } from '@/server/verifications';

/**
 * Serves one submitted identity document.
 *
 * ── The same defence as a deposit proof, for a more sensitive file ────────────
 * `inspectDocument` decides what a file is from its bytes, which stops an HTML file
 * called `passport.png`. It cannot stop a *genuine* PNG with script in its body — a
 * polyglot is a real image and sniffing has nothing to object to — so the response
 * is built to make the contents irrelevant: `nosniff` so the browser cannot
 * second-guess the declared type, a `Content-Security-Policy` on the response
 * itself so that a document interpreted as one can load and execute nothing, and a
 * declared type that comes from storage rather than from the uploader.
 *
 * ── `no-store` matters more here than anywhere else in the app ────────────────
 * This is a photograph of somebody's passport. It must never reach a shared cache,
 * a CDN, or a disk cache an operator's laptop later syncs somewhere.
 *
 * ── Who may see it ───────────────────────────────────────────────────────────
 * The customer who submitted it, and operators. Checked here rather than on the
 * console page, because a route handler is a public URL and the page's
 * `requireAdmin` protects the page and nothing else.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Next 16: route params are a Promise.
  const { id } = await context.params;

  const user = await getCurrentUser();
  if (user === null) notFound();

  const document = await getVerificationDocument(id);
  // 404 rather than 403 for a submission that exists but is not theirs: confirming
  // an id is real is the first thing worth knowing if you are guessing them.
  if (document === null) notFound();
  if (document.ownerId !== user.id && user.role !== 'admin') notFound();

  return new Response(document.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': document.contentType,
      'content-length': String(document.bytes.byteLength),
      'x-content-type-options': 'nosniff',
      // Extension-less by construction: the filename the customer chose was never
      // stored, so it cannot carry an executable one here.
      'content-disposition': `inline; filename="document-${id}"`,
      'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store, private',
    },
  });
}
