import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';

import { requireAdmin } from '@/server/auth';
import { getSupportInbox, getSupportThread } from '@/server/support';

import { AdminPageHeader } from '../../_components/admin-ui';
import { SupportConsole } from './_components/support-console';

/**
 * Live support.
 *
 * ── Rendered on the server, then handed to a listener ──────────────────────────
 * The inbox and the newest thread are read here, so an operator opening the
 * console sees conversations immediately rather than an empty panel waiting on a
 * bundle parse, a Firebase sign-in and a first snapshot. The client component
 * attaches the Firestore listener and takes over from there.
 *
 * ── Why Firestore at all, when everything else is Postgres ─────────────────────
 * A reply has to appear while somebody is waiting for it, and a serverless
 * deployment cannot hold a socket open to do that. It is the only part of this
 * application with that requirement — presence is a heartbeat, a ledger history
 * does not change while you read it — so it is the only part that moved.
 *
 * Nothing else went with it. The customer beside each conversation is this
 * platform's own identity record, and whether they are online and what page they
 * are on is the presence heartbeat that already drives the live board.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live support',
  robots: { index: false, follow: false },
};

export default async function SupportPage({
  searchParams,
}: {
  // `?conversation=` is where a push notification about a message points.
  searchParams: Promise<{ conversation?: string | string[] }>;
}) {
  const operator = await requireAdmin('/admin/support');
  const [inbox, { conversation: requested }] = await Promise.all([
    getSupportInbox(),
    searchParams,
  ]);

  // The transcript of the conversation a notification linked to, or else the
  // newest, so the thread panel is filled on arrival too. One extra read, on the one
  // conversation the operator is most likely to open first. Matched against the
  // inbox rather than read by id, so a link can only open a thread the inbox has.
  const newest =
    inbox.conversations.find((conversation) => conversation.id === requested) ??
    inbox.conversations[0] ??
    null;
  const thread = newest === null ? null : await getSupportThread(newest.id);

  return (
    <>
      <AdminPageHeader
        title="Live support"
        // Was "every conversation carries the customer's account beside it": that
        // described the context panel, which is gone. The account is a click from
        // the thread now, and saying otherwise sends an agent looking for a column
        // that is not there.
        description="Pick somebody to read the conversation and reply."
      />

      {!inbox.configured ? (
        <div className="flex items-start gap-3 rounded-lg border border-warn/35 bg-warn/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-fg-muted">
            Live chat is not configured. Set the Firebase variables in the environment
            and this screen fills itself — nothing else on the platform depends on them.
          </p>
        </div>
      ) : (
        <>
          {inbox.degraded ? (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
              <p className="text-xs leading-relaxed text-fg-muted">
                Conversations could not be read. This is an empty screen, not an empty
                inbox — nothing below is a statement about who is waiting.
              </p>
            </div>
          ) : null}

          <SupportConsole
            operatorId={operator.id}
            initialConversations={inbox.conversations}
            initialCustomers={inbox.customers}
            initialThread={{
              conversationId: newest?.id ?? null,
              messages: thread?.messages ?? [],
            }}
          />
        </>
      )}
    </>
  );
}
