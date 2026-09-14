import { notFound } from 'next/navigation';

import { presentSupportError, type ConversationPriority } from '@/modules/support';
import type { ConversationAction } from '@/modules/support/server';
import { getCurrentUser } from '@/server/auth';
import { support } from '@/server/support';

/**
 * Operator actions on one conversation: claim, resolve, prioritise, mark read.
 *
 * ── Operators only, checked here ──────────────────────────────────────────────
 * The console's layout protects the page, not this URL, and this one closes other
 * people's support threads. So the role is re-derived, and a signed-in customer
 * gets 404 rather than 403 — for the reason the rest of the console does.
 */

export const dynamic = 'force-dynamic';

const PRIORITIES = new Set<string>(['low', 'normal', 'high', 'urgent']);

interface Body {
  action?: unknown;
  priority?: unknown;
}

export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Next 16: route params are a Promise.
  const { id } = await route.params;

  const user = await getCurrentUser();
  if (user === null || user.role !== 'admin') notFound();

  // Not named `module`: that identifier is reserved in a CommonJS scope, and Next
  // refuses the build rather than let the shadowing surprise somebody later.
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

  const action = parseAction(payload);
  if (action === null) {
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const result = await context.decideConversation({
    conversationId: id,
    operatorId: user.id,
    action,
  });

  if (!result.ok) {
    const status = result.error.kind === 'conversation-not-found' ? 404 : 400;
    return Response.json({ error: presentSupportError(result.error) }, { status });
  }

  return Response.json(result.value, {
    status: 200,
    headers: { 'cache-control': 'no-store, private' },
  });
}

/** Rejects anything not in the union rather than widening a string into it. */
function parseAction(payload: Body): ConversationAction | null {
  switch (payload.action) {
    case 'claim':
      return { kind: 'claim' };
    case 'resolve':
      return { kind: 'resolve' };
    case 'mark-read':
      return { kind: 'mark-read' };
    case 'prioritise':
      return typeof payload.priority === 'string' && PRIORITIES.has(payload.priority)
        ? { kind: 'prioritise', priority: payload.priority as ConversationPriority }
        : null;
    default:
      return null;
  }
}
