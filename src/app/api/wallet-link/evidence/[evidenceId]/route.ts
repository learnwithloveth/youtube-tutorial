import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';
import { getWalletEvidence } from '@/server/wallet-link';

/**
 * Serves one wallet's attached screenshot.
 *
 * ── The response headers are the real defence ──────────────────────────────────
 * `inspectEvidence` decides what a file is from its bytes, which stops an HTML
 * file called `wallet.png`. It cannot stop a *genuine* PNG with script in its
 * body — a polyglot is a real image, and sniffing has nothing to object to.
 *
 * So the bytes are served in a way that makes their contents irrelevant. This is
 * the same set `api/deposits/[claimId]/proof` carries, and deliberately identical:
 * two upload paths with different hardening is one upload path that is hardened
 * and one that is the way in.
 *
 *  - `X-Content-Type-Options: nosniff` stops the browser second-guessing the type
 *    we declare, which is the whole polyglot attack.
 *  - `Content-Disposition: inline` with an extension-less filename, so a saved
 *    file cannot carry an executable extension from a name the customer chose —
 *    it never had one to begin with.
 *  - A restrictive `Content-Security-Policy` on the response itself, so that if
 *    it somehow *is* parsed as a document, it can load and execute nothing.
 *  - `Content-Type` is the sniffed type from storage, never anything supplied.
 *
 * The sessions this protects are a customer's and an operator's, and the operator
 * one also approves payments.
 *
 * ── Who may see it ────────────────────────────────────────────────────────────
 * The customer it belongs to, and operators. Checked *here*, because a route
 * handler is a public URL — the console page's `requireAdmin` protects the page
 * and nothing else. The owner is derived from the key rather than accepted beside
 * it, for the obvious reason: everything in a URL is chosen by the caller.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ evidenceId: string }> },
): Promise<Response> {
  // Next 16: route params are a Promise.
  const { evidenceId } = await context.params;

  const user = await getCurrentUser();
  if (user === null) notFound();

  const file = await getWalletEvidence(evidenceId);
  // 404 rather than 403 for a file that exists and is not theirs: telling somebody
  // a key is real is the first thing worth knowing if you are guessing them.
  if (file === null) notFound();
  if (file.ownerId !== user.id && user.role !== 'admin') notFound();

  return new Response(file.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.bytes.byteLength),
      'x-content-type-options': 'nosniff',
      'content-disposition': `inline; filename="wallet-evidence-${evidenceId}"`,
      'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
      // A screenshot of somebody's wallet app. It must never sit in a shared
      // cache, and `private` alone is not enough on a URL an operator opens.
      'cache-control': 'no-store, private',
    },
  });
}
