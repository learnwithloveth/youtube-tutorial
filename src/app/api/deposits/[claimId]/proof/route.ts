import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { getDepositProof } from '@/server/ledger';

/**
 * Serves one deposit proof image.
 *
 * ── The response headers are the real defence ──────────────────────────────────
 * `inspectProof` decides what a file is from its bytes, which stops an HTML file
 * called `receipt.png`. It cannot stop a *genuine* PNG with script in its body —
 * a polyglot is a real image, and sniffing has nothing to object to.
 *
 * So the bytes are served in a way that makes it irrelevant what is inside them:
 *
 *  - `X-Content-Type-Options: nosniff` stops the browser second-guessing the type
 *    we declare. Without it, a browser that decides a file "looks like" HTML will
 *    render it as HTML, which is the whole polyglot attack.
 *  - `Content-Disposition: inline` with an extension-less filename. Inline,
 *    because the console renders the proof in an `<img>` and an attachment
 *    disposition would turn opening a transaction into a download. What stops it
 *    being treated as a *document* is `nosniff` plus the declared image type: a
 *    browser told `image/png` and forbidden from second-guessing has no path to
 *    parsing the bytes as HTML.
 *  - A restrictive `Content-Security-Policy` on the response itself, so that if it
 *    somehow *is* interpreted as a document, it can load and execute nothing.
 *  - `Content-Type` is the sniffed type from storage, never anything the uploader
 *    supplied.
 *
 * The session this protects is the one that approves payments, which is why the
 * belt and braces are both here.
 *
 * ── Who may see it ────────────────────────────────────────────────────────────
 * The customer who submitted it, and operators. Checked here rather than at the
 * page, because a route handler is a public URL: the console page's `requireAdmin`
 * protects the page and nothing else.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ claimId: string }> },
): Promise<Response> {
  // Next 16: route params are a Promise.
  const { claimId } = await context.params;

  const user = await getCurrentUser();
  if (user === null) notFound();

  const proof = await getDepositProof(claimId);
  // 404 rather than 403 for a claim that exists but is not theirs: telling someone
  // a claim id is real is the first thing worth knowing if you are guessing them.
  if (proof === null) notFound();
  if (proof.ownerId !== user.id && user.role !== 'admin') notFound();

  return new Response(proof.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': proof.contentType,
      'content-length': String(proof.bytes.byteLength),
      'x-content-type-options': 'nosniff',
      // Named so a downloaded file cannot carry an executable extension from a
      // filename the customer chose — it never had one to begin with.
      'content-disposition': `inline; filename="proof-${claimId}"`,
      'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
      // A deposit proof shows someone's bank balance. It must never sit in a shared
      // cache, and `private` alone is not enough on a URL an operator opens.
      'cache-control': 'no-store, private',
    },
  });
}
