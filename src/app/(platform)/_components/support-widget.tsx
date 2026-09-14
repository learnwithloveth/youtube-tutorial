'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, Headset, X } from 'lucide-react';

import type { ConversationDto, MessageDto } from '@/modules/support';
import { useOwnConversation } from '@/shared/firebase/use-support-realtime';
import { cn } from '@/shared/lib/cn';
import { ChatComposer } from '@/shared/ui/chat/chat-composer';
import { useAttachment } from '@/shared/ui/chat/use-attachment';

import { CHAT_WALLPAPER, dayLabelFor, utcDayKey } from './chat-surface';

/**
 * The customer's chat with support.
 *
 * ── Built to WhatsApp's conventions, in this product's palette ─────────────────
 * The shapes and the behaviour are borrowed on purpose: a patterned ground, bubbles
 * with a clipped corner on the sender's side, the timestamp tucked inside the
 * bubble, day separators, and delivery ticks. Those are not decoration — they are
 * the conventions a billion people already have in their hands, and matching them
 * means nobody has to learn this.
 *
 * The composer is `ChatComposer`, shared with the operator's console so the two
 * cannot drift apart again — they already had, and an agent could not answer a
 * screenshot with a screenshot.
 *
 * The colours are not borrowed. A green WhatsApp clone dropped inside a violet
 * exchange reads as a third-party embed, which is the opposite of what a support
 * widget should look like.
 *
 * ── It sends through this application, and reads from Firestore ────────────────
 * Two different paths on purpose. The send is a POST to a route that holds the
 * session and writes with admin credentials, so the rule about who may say what
 * lives in one place. The read is a Firestore listener, because that is the socket
 * a serverless deployment cannot hold, and a reply appearing a second after it is
 * typed is the entire product here.
 *
 * ── No subject field ───────────────────────────────────────────────────────────
 * A box and a send button. Anything between somebody with a problem and the place
 * they type it is a step that converts a question into an abandoned session, and
 * the first line of what they wrote is a better summary than most people would put
 * in a "Subject" input. The thread names itself — see `subjectFrom`.
 */

const OPTIMISTIC_PREFIX = 'pending:';

export function SupportWidget({
  userId,
  initialConversation,
  initialMessages,
}: {
  userId: string;
  initialConversation: ConversationDto | null;
  initialMessages: readonly MessageDto[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Messages posted but not yet echoed back by the listener.
   *
   * Without these, pressing Enter clears the box and nothing appears until
   * Firestore's round trip completes — which on a slow connection reads as a lost
   * message and produces a second copy of it.
   */
  const [pending, setPending] = useState<MessageDto[]>([]);

  const { attachment, setAttachment, uploading, error: uploadError, attach } = useAttachment();
  const threadRef = useRef<HTMLDivElement>(null);

  const { conversation, messages, status } = useOwnConversation({
    // No listener until the panel is opened. A customer who never contacts support
    // should not be paying for a Firestore connection on every page of the app.
    enabled: open,
    userId,
    initialConversation,
    initialMessages,
  });

  const shown = useMemo(() => {
    const confirmed = new Set(messages.map((message) => message.body));
    // Dropped by body rather than by id: the server assigns the real id, so the
    // optimistic copy can never match one.
    return [...messages, ...pending.filter((message) => !confirmed.has(message.body))];
  }, [messages, pending]);

  /**
   * How many of this customer's own messages the agent has already opened.
   *
   * Real, not decorative. `unreadForOperator` counts exactly the customer messages
   * nobody has read, so the last N of them are unread and everything before is
   * read. That gives the two ticks their actual meaning, instead of a checkmark
   * that always says the same thing.
   */
  const unreadFromMe = conversation?.unreadForOperator ?? 0;
  const readBoundary = useMemo(
    () => shown.filter((message) => message.author === 'customer').length - unreadFromMe,
    [shown, unreadFromMe],
  );

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [shown.length, open]);

  const send = useCallback(async () => {
    const body = draft.trim();
    // An image on its own is a message: somebody who screenshots the error has said
    // something, and demanding a caption would be a field between them and the point.
    if ((body.length === 0 && attachment === null) || sending) return;

    const optimistic: MessageDto = {
      id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
      conversationId: conversation?.id ?? '',
      author: 'customer',
      authorId: userId,
      body,
      attachmentId: attachment?.id ?? null,
      sentAt: new Date().toISOString(),
    };

    const sentAttachment = attachment;
    setDraft('');
    setAttachment(null);
    setPending((queue) => [...queue, optimistic]);
    setSending(true);
    setFailed(null);

    try {
      const response = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body,
          ...(conversation !== null ? { conversationId: conversation.id } : {}),
          ...(sentAttachment !== null ? { attachmentId: sentAttachment.id } : {}),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setFailed(payload.error ?? 'That did not send. Try again.');
        // Both go back rather than being lost. Somebody typed the one and chose the
        // other, and the upload is still stored and still unclaimed.
        setDraft(body);
        setAttachment(sentAttachment);
        setPending((queue) => queue.filter((message) => message.id !== optimistic.id));
      }
    } catch {
      setFailed('That did not send. Check your connection and try again.');
      setDraft(body);
      setAttachment(sentAttachment);
      setPending((queue) => queue.filter((message) => message.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversation, userId, attachment, setAttachment]);

  const unread = conversation?.unreadForCustomer ?? 0;
  // Either source, one line. A rejected upload and a failed send are the same
  // problem from where the customer is sitting.
  const problem = failed ?? uploadError;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-4 py-3 text-sm font-medium text-fg shadow-float transition-colors hover:border-brand-soft"
      >
        <Headset className="size-4 text-brand-soft" />
        Support
        {unread > 0 ? (
          <span className="grid size-5 place-items-center rounded-full bg-brand text-2xs font-semibold text-on-brand">
            {unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[34rem] max-h-[calc(100dvh-2.5rem)] w-[min(23rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-bg-elev shadow-float">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-soft"
        >
          <Headset className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">Novex Support</p>
          {/* Where WhatsApp shows "online". Ours reports the connection, because
              that is what this application actually knows — nothing here tracks
              whether an agent is at their desk. */}
          <p className="flex items-center gap-1.5 truncate text-2xs text-fg-subtle">
            {/* A customer is never told about a Firebase setting. Polling is a
                working conversation on a timer, so it says so plainly and nothing
                more — the specifics belong on the operator's screen. */}
            {status === 'live' ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-up" />
                Connected
              </>
            ) : status === 'connecting' ? (
              'Connecting…'
            ) : status === 'polling' ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-warn" />
                Checking for replies
              </>
            ) : (
              'Offline — messages still send'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <X className="size-4" />
          <span className="sr-only">Close support</span>
        </button>
      </header>

      <div
        ref={threadRef}
        className="relative flex-1 overflow-y-auto bg-bg-sunken px-3 py-3"
        // The wallpaper. Painted on the scroll container rather than on a child, so
        // it stays put while the messages move over it — the way a chat ground does.
        style={{
          backgroundImage: CHAT_WALLPAPER,
          backgroundRepeat: 'repeat',
          backgroundSize: '220px 220px',
        }}
      >
        {/* The pattern is drawn in `currentColor`; this veil is what keeps it a
            whisper rather than a rash, in either theme. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-bg-sunken/80" />

        <div className="relative">
          {shown.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-brand/15 text-brand-soft">
                <Headset className="size-5" />
              </span>
              <p className="text-xs leading-relaxed text-fg-muted">
                Ask anything about your account, a deposit or a withdrawal. An agent
                sees your account beside your message, so there is no reference to
                look up.
              </p>
            </div>
          ) : (
            <Thread messages={shown} readBoundary={readBoundary} />
          )}
        </div>
      </div>

      {problem !== null ? (
        <p role="status" className="border-t border-down/35 bg-down/8 px-4 py-2 text-2xs text-fg">
          {problem}
        </p>
      ) : null}

      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        onAttach={(file) => void attach(file)}
        attachment={attachment}
        onClearAttachment={() => setAttachment(null)}
        uploading={uploading}
        sending={sending}
      />
    </div>
  );
}

/**
 * The transcript, grouped by day and by run of author.
 *
 * ── Two groupings, both doing work ─────────────────────────────────────────────
 * A day separator answers "when was this" without putting a date on every line.
 * Collapsing consecutive messages from one author removes the repeated tail and
 * lets a burst of three read as one turn — which is how people actually type, and
 * why a thread without it looks like an argument.
 */
function Thread({
  messages,
  readBoundary,
}: {
  messages: readonly MessageDto[];
  readBoundary: number;
}) {
  // Fixed for the render, so every separator in one paint agrees about "today".
  const now = useMemo(() => new Date(), []);

  /**
   * The decoration computed in one pass, before anything renders.
   *
   * Both facts a row needs — whether it opens a new day, and how many of the
   * customer's own messages came before it — depend on everything above it. Working
   * that out inside the `map` means carrying a counter across the render, which is
   * a mutation React's compiler correctly refuses. Doing it here keeps the render
   * pure and the arithmetic in one place.
   */
  const rows = useMemo(() => {
    // Where each of the customer's own messages falls in their own sequence, built
    // once. Counting during the walk would mean a running total reassigned per row,
    // which React's compiler refuses — and rightly: a mutation whose value depends
    // on render order is exactly what breaks when rendering is interrupted.
    const minePosition = new Map(
      messages
        .filter((message) => message.author === 'customer')
        .map((message, position) => [message.id, position] as const),
    );

    return messages.map((message, index) => {
      const previous = index > 0 ? messages[index - 1] : undefined;
      // Purely positional: a row opens a new day when the row above it sits on a
      // different one. No accumulator needed.
      const newDay =
        previous === undefined || utcDayKey(previous.sentAt) !== utcDayKey(message.sentAt);

      return {
        message,
        newDay,
        grouped: !newDay && previous?.author === message.author,
        // Read once the agent has opened everything up to it — see `readBoundary`.
        read:
          message.author === 'customer' && (minePosition.get(message.id) ?? -1) < readBoundary,
      };
    });
  }, [messages, readBoundary]);

  return (
    <>
      {rows.map((row) => (
        <div key={row.message.id}>
          {row.newDay ? (
            <div className="flex justify-center py-2">
              <span className="rounded-full bg-bg-elev/90 px-2.5 py-1 text-2xs font-medium text-fg-subtle shadow-sm">
                {dayLabelFor(row.message.sentAt, now)}
              </span>
            </div>
          ) : null}

          <Bubble message={row.message} grouped={row.grouped} read={row.read} />
        </div>
      ))}
    </>
  );
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function Bubble({
  message,
  grouped,
  read,
}: {
  message: MessageDto;
  grouped: boolean;
  read: boolean;
}) {
  if (message.author === 'system') {
    return (
      <div className="flex justify-center py-1.5">
        <span className="max-w-[90%] rounded-lg bg-bg-elev/90 px-2.5 py-1 text-center text-2xs leading-relaxed text-fg-subtle shadow-sm">
          {message.body}
        </span>
      </div>
    );
  }

  const mine = message.author === 'customer';
  const unsent = message.id.startsWith(OPTIMISTIC_PREFIX);

  return (
    <div
      className={cn('flex', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-2')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-2 py-1.5 shadow-sm',
          mine ? 'bg-brand/20 text-fg' : 'border border-line bg-bg-elev text-fg',
          // The clipped corner points at the sender, and only on the first message
          // of a run — which is what makes a burst read as one turn rather than
          // three separate interruptions.
          mine && !grouped && 'rounded-br-md',
          !mine && !grouped && 'rounded-bl-md',
          unsent && 'opacity-60',
        )}
      >
        {message.attachmentId !== null ? (
          <a
            href={`/api/support/attachments/${message.attachmentId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mb-1 block overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image would proxy this through the optimiser, which caches by
                URL and would leave somebody's screenshot in a shared cache. A plain
                img keeps it on the no-store route that authorises every request. */}
            <img
              src={`/api/support/attachments/${message.attachmentId}`}
              alt="Attached image"
              className="max-h-56 w-full bg-surface object-contain"
            />
          </a>
        ) : null}

        {/* The timestamp sits inside the bubble and the text flows around it, which
            is what stops a one-word message being three times taller than it needs
            to be. The float is the mechanism; the cleared spacer reserves the room
            so the last line never runs underneath it. */}
        <div className="px-1.5">
          <span className="float-right ml-2 mt-1 inline-flex select-none items-center gap-0.5 text-[10px] leading-none text-fg-subtle">
            {TIME.format(new Date(message.sentAt))}
            {mine ? (
              unsent ? (
                <Check className="size-3 opacity-50" />
              ) : read ? (
                <CheckCheck className="size-3 text-accent" />
              ) : (
                <Check className="size-3" />
              )
            ) : null}
          </span>

          {message.body.length > 0 ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.body}
            </p>
          ) : null}

          <span aria-hidden className="block clear-both" />
        </div>
      </div>
    </div>
  );
}
