import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { support } from '@/server/support';

/**
 * Serves one chat attachment.
 *
 * ── The response headers are the real defence ──────────────────────────────────
 * Sniffing the bytes on upload stops an HTML file called `screenshot.png`. It
 * cannot stop a *genuine* image with script in its body — a polyglot is a real
 * image, and sniffing has nothing to object to.
 *
 * So the bytes are served in a way that makes their contents irrelevant:
 *
 *  - `X-Content-Type-Options: nosniff` stops the browser second-guessing the type
 *    we declare. Without it, a browser that decides a file "looks like" HTML will
 *    render it as HTML, which is the whole polyglot attack.
 *  - A restrictive `Content-Security-Policy` on the response itself, so that if it
 *    somehow *is* interpreted as a document, it can load and execute nothing.
 *  - `Content-Type` is the sniffed type from storage, never anything the uploader
 *    supplied.
 *  - `inline` disposition with an extension-less filename, because the widget and
 *    the console both render it in an `<img>` — an attachment disposition would
 *    turn opening a conversation into a download.
 *
 * This one matters more than the deposit proof's: that image is opened only by an
 * operator, and this is served back to the customer too. Two sessions, one header
 * set.
 *
 * ── Who may see it ───────────────────────────────────────────────────────────
 * Operators, whoever uploaded it, and the customer whose conversation it is in.
 * 404 rather than 403 for an image that exists but is not theirs: telling somebody
 * an id is real is the first thing worth knowing if you are guessing them.
 *
 * That third case is not a widening, it is the fix for a hole in the first two.
 * The check used to be "operator, or the uploader" — which works perfectly for a
 * customer's own screenshot and fails completely for an operator's reply, because
 * the uploader there is the operator. The customer it was sent to got a 404 and a
 * broken image, in the one thread where they were waiting for it. See
 * `StoredAttachment.customerId`.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  route: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Next 16: route params are a Promise.
  const { id } = await route.params;

  const user = await getCurrentUser();
  if (user === null) notFound();

  const context = support();
  if (context === null) notFound();

  const attachment = await context.dependencies.attachments.get(id);
  if (attachment === null) notFound();

  const maySee =
    user.role === 'admin' ||
    // Their own upload — including one still unclaimed, which is what makes the
    // preview work between picking the file and sending the message.
    attachment.userId === user.id ||
    // Or it was sent into their conversation, by whoever.
    attachment.customerId === user.id;
  if (!maySee) notFound();

  return new Response(attachment.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': attachment.contentType,
      'content-length': String(attachment.byteLength),
      'x-content-type-options': 'nosniff',
      'content-disposition': `inline; filename="attachment-${id}"`,
      'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
      // Somebody's screenshot of their own account. It must never sit in a shared
      // cache, and `private` alone is not enough on a URL an operator opens.
      'cache-control': 'no-store, private',
    },
  });
}
