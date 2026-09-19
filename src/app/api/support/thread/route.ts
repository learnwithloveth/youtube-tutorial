import { getCurrentUser } from '@/server/auth';
import { getMySupportThread, getSupportInbox, getSupportThread, support } from '@/server/support';

/**
 * One conversation, read through this application rather than through Firestore.
 *
 * ── Why a polling endpoint exists beside a realtime listener ───────────────────
 * The listener is the design: a reply has to appear while somebody is waiting for
 * it. But it can fail to attach for reasons that have nothing to do with this
 * application — a Firebase project without Authentication enabled, a network that
 * blocks the transport, a browser with storage disabled — and when it does, the
 * entire feature goes silent. Not degraded: silent. A message is written, nobody
 * sees it, and neither side is told why.
 *
 * That is a single point of failure for the one screen where somebody is waiting
 * for an answer, so there is a second path. The client attaches the listener first
 * and falls back to polling this only when it could not. Slower, and working beats
 * instant and absent.
 *
 * ── `since` makes an idle poll cost one read ───────────────────────────────────
 * Firestore bills per document. Returning the whole transcript every few seconds
 * would be a dozen reads per poll per person, which exhausts a free tier in hours
 * while nothing is happening.
 *
 * So the caller sends the timestamp of the newest message it already has, and this
 * reads the *conversation summary* — one document, carrying `lastMessageAt` — and
 * answers `{ changed: false }` when nothing is newer. The transcript is fetched
 * only when there is something in it to fetch.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) return Response.json({ error: 'not-signed-in' }, { status: 401 });

  if (support() === null) {
    return Response.json({ error: 'support-unavailable' }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const conversationId = params.get('conversationId');
  const since = params.get('since');

  const operator = user.role === 'admin';

  // A customer may only ever read their own, whatever they asked for — the id is
  // ignored rather than checked, so there is nothing to get wrong.
  //
  // An operator addresses a thread by id. Naming none means their own, exactly as
  // it does for anybody else: an operator has a support thread too, and the widget
  // asks for it without an id. This used to answer them an empty thread, so the
  // widget never learned a conversation existed and every message they sent came
  // back as 'that conversation is no longer available'.
  const thread =
    operator && conversationId !== null
      ? await getSupportThread(conversationId)
      : await getMySupportThread(user.id);

  if (thread.conversation === null) {
    return json({ changed: true, conversation: null, messages: [] });
  }

  // Nothing newer than what the caller already has. The transcript was never read,
  // which is the whole point of the parameter.
  if (since !== null && thread.conversation.lastMessageAt <= since) {
    return json({ changed: false });
  }

  return json({
    changed: true,
    conversation: thread.conversation,
    messages: thread.messages,
  });
}

/**
 * The operator's inbox, for the same fallback.
 *
 * Exposed on this route rather than its own because it answers the same question
 * one level up — "what has changed" — and a second file would repeat every line of
 * the authority check above it.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') {
    return Response.json({ error: 'not-signed-in' }, { status: 401 });
  }

  if (support() === null) {
    return Response.json({ error: 'support-unavailable' }, { status: 503 });
  }

  void request;
  const inbox = await getSupportInbox();

  return json({ conversations: inbox.conversations, customers: inbox.customers });
}

function json(body: unknown): Response {
  return Response.json(body, {
    status: 200,
    // Never cached: this is one person's conversation, and it changes.
    headers: { 'cache-control': 'no-store, private' },
  });
}
