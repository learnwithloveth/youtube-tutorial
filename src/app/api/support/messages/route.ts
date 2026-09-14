import { presentSupportError } from '@/modules/support';
import { getCurrentUser } from '@/server/auth';
import { support } from '@/server/support';

/**
 * Posts one message, from either side of a conversation.
 *
 * ── Every write goes through here, not through Firestore ───────────────────────
 * The browser reads straight from Firestore — that is the socket this application
 * cannot otherwise hold — but it never writes there. The security rules deny
 * client writes outright, and this route, holding admin credentials, is the only
 * thing that can append.
 *
 * That is what keeps the session the single authority. Were the widget to write
 * directly, every rule about who may say what would have to be expressed a second
 * time in Firestore's rule language, kept in step with `src/server/auth.ts` by
 * nothing but discipline — and the first divergence would be a customer posting
 * into somebody else's thread.
 *
 * It also means no Cloud Functions, and therefore no paid plan: the push that
 * announces a message is sent by the same request that wrote it.
 *
 * ── Authority is re-derived here ──────────────────────────────────────────────
 * A route handler is a public URL. The page that rendered the widget protects
 * nothing, so the session is read again and the author's role decided from it —
 * never from anything the caller sent.
 */

export const dynamic = 'force-dynamic';

interface Body {
  conversationId?: unknown;
  body?: unknown;
  attachmentId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) return Response.json({ error: 'not-signed-in' }, { status: 401 });

  const context = support();
  if (context === null) {
    return Response.json({ error: 'support-unavailable' }, { status: 503 });
  }

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  // A body is still required as a *field*; it may be empty when an image is
  // attached, and the use case decides that rather than this route.
  if (typeof payload.body !== 'string') {
    return Response.json({ error: 'Write something first.' }, { status: 400 });
  }

  const result = await context.postMessage({
    // The author is decided from the session, never from the request. A customer
    // who posts `author: 'operator'` is still a customer.
    author: user.role === 'admin' ? 'operator' : 'customer',
    authorId: user.id,
    body: payload.body,
    ...(typeof payload.conversationId === 'string'
      ? { conversationId: payload.conversationId }
      : {}),
    // Not trusted here: the use case claims it against the uploader and the
    // conversation, and refuses an id that is not theirs.
    ...(typeof payload.attachmentId === 'string'
      ? { attachmentId: payload.attachmentId }
      : {}),
  });

  if (!result.ok) {
    // 404 for a conversation that is not theirs, matching what the use case
    // returns and what the rest of the console does: a 403 would confirm the id.
    const status = result.error.kind === 'conversation-not-found' ? 404 : 400;
    return Response.json({ error: presentSupportError(result.error) }, { status });
  }

  return Response.json(result.value, {
    status: 201,
    headers: { 'cache-control': 'no-store, private' },
  });
}
