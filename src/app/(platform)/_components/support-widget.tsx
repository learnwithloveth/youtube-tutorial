'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Headset, ImagePlus, Loader2, MessageSquare, X } from 'lucide-react';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  type ConversationDto,
  type MessageDto,
} from '@/modules/support';
import { useOwnConversation } from '@/shared/firebase/use-support-realtime';
import { formatClock } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

/**
 * The customer's chat with support.
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

  /**
   * An image already uploaded and waiting to be sent.
   *
   * Uploaded as soon as it is picked, rather than on send, so the slow part happens
   * while somebody is still typing their caption — and so a rejected file is
   * rejected before they have written one.
   *
   * `preview` is an object URL over the local file, not the stored copy: drawing it
   * from the server would mean waiting for a round trip to see the thing already on
   * the machine.
   */
  const [attachment, setAttachment] = useState<{
    id: string;
    preview: string;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { conversation, messages, status } = useOwnConversation({
    // No listener until the panel is opened. A customer who never contacts support
    // should not be paying for a Firestore connection on every page of the app.
    enabled: open,
    userId,
    initialConversation,
    initialMessages,
  });

  const threadRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const confirmed = new Set(messages.map((message) => message.body));
    // Dropped by body rather than by id: the server assigns the real id, so the
    // optimistic copy can never match one. Same text from the same person within a
    // second of sending it is the echo.
    return [...messages, ...pending.filter((message) => !confirmed.has(message.body))];
  }, [messages, pending]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [shown.length, open]);

  // Object URLs are a leak if nothing releases them, and a widget that is opened
  // and closed all day accumulates one per image picked.
  useEffect(
    () => () => {
      if (attachment !== null) URL.revokeObjectURL(attachment.preview);
    },
    [attachment],
  );

  const pick = useCallback(async (file: File) => {
    // Checked here as well as on the server: refusing a 40MB photograph before it
    // crosses the network is the difference between an instant message and a long
    // wait for a rejection.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setFailed('That image is larger than 2MB. A screenshot is usually well under it.');
      return;
    }

    setUploading(true);
    setFailed(null);
    try {
      const form = new FormData();
      form.append('file', file);

      const response = await fetch('/api/support/attachments', { method: 'POST', body: form });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setFailed(payload.error ?? 'That image could not be uploaded.');
        return;
      }

      const { attachmentId } = (await response.json()) as { attachmentId: string };
      setAttachment({
        id: attachmentId,
        preview: URL.createObjectURL(file),
        name: file.name,
      });
    } catch {
      setFailed('That image could not be uploaded. Check your connection.');
    } finally {
      setUploading(false);
      // Cleared so picking the same file twice in a row still fires `change`.
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const send = useCallback(async () => {
    const body = draft.trim();
    // An image on its own is a message: somebody who screenshots the error has
    // said something, and demanding a caption would be a field between them and
    // the point.
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
        // Both go back rather than being lost. Somebody typed the one and chose
        // the other, and the upload is still stored and still unclaimed.
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
  }, [draft, sending, conversation, userId, attachment]);

  const unread = conversation?.unreadForCustomer ?? 0;

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
    <div className="fixed bottom-5 right-5 z-40 flex h-[32rem] w-[min(23rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-bg-elev shadow-float">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Headset className="size-4 shrink-0 text-brand-soft" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">Support</p>
          <p className="truncate text-2xs text-fg-subtle">
            {status === 'connecting'
              ? 'Connecting…'
              : status === 'unavailable'
                ? 'Live updates unavailable — messages still send'
                : conversation?.status === 'resolved'
                  ? 'Resolved · reply to reopen'
                  : 'We reply here, and by email if you leave'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line p-1.5 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <X className="size-3.5" />
          <span className="sr-only">Close support</span>
        </button>
      </header>

      <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <MessageSquare className="size-5 text-fg-subtle" />
            <p className="text-xs leading-relaxed text-fg-subtle">
              Ask anything about your account, a deposit or a withdrawal. An agent sees
              your account beside your message, so there is no reference to look up.
            </p>
          </div>
        ) : (
          shown.map((message) => <Bubble key={message.id} message={message} />)
        )}
      </div>

      {failed !== null ? (
        <p role="status" className="border-t border-down/35 bg-down/8 px-4 py-2 text-2xs text-fg">
          {failed}
        </p>
      ) : null}

      <div className="border-t border-line p-3">
        {attachment !== null ? (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-bg-sunken/60 p-2">
            {/* The local file, not the stored copy: drawing it from the server would
                mean waiting for a round trip to see something already on the machine. */}
            {/* eslint-disable-next-line @next/next/no-img-element --
                an object URL has no remote origin for next/image to optimise. */}
            <img
              src={attachment.preview}
              alt=""
              className="size-10 shrink-0 rounded object-cover"
            />
            <span className="min-w-0 flex-1 truncate text-2xs text-fg-muted">
              {attachment.name}
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="rounded border border-line p-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <X className="size-3" />
              <span className="sr-only">Remove image</span>
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            // The formats the byte-sniffer accepts. It is a hint to the picker, not
            // a control: the server decides from the bytes regardless.
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void pick(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || attachment !== null}
            aria-label="Attach an image"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a newline — the convention everyone
              // already has in their fingers from every other chat.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Type your message…"
            aria-label="Message to support"
            className="min-h-14 flex-1 resize-none rounded-md border border-line bg-bg-sunken/60 px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={(draft.trim().length === 0 && attachment === null) || sending}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-brand-soft/40 bg-brand/12 px-3 text-xs font-medium text-brand-soft transition-colors hover:border-brand-soft/70 hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="size-3.5" />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: MessageDto }) {
  if (message.author === 'system') {
    return (
      <p className="text-center text-2xs leading-relaxed text-fg-subtle">{message.body}</p>
    );
  }

  const mine = message.author === 'customer';
  const unsent = message.id.startsWith(OPTIMISTIC_PREFIX);

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          mine
            ? 'rounded-br-sm bg-brand/15 text-fg'
            : 'rounded-bl-sm border border-line bg-bg-sunken/70 text-fg',
          unsent && 'opacity-60',
        )}
      >
        {message.attachmentId !== null ? (
          <a
            href={`/api/support/attachments/${message.attachmentId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mb-1.5 block overflow-hidden rounded border border-line"
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
        {message.body.length > 0 ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        ) : null}
        <p className="mt-1 text-2xs text-fg-subtle">
          {unsent ? 'Sending…' : formatClock(message.sentAt)}
        </p>
      </div>
    </div>
  );
}
