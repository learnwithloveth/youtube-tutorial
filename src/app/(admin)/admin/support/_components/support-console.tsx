'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  Loader2,
  UserPlus,
} from 'lucide-react';

import {
  type ConversationDto,
  type ConversationPriority,
  type MessageDto,
} from '@/modules/support';
import type { SupportCustomerDto } from '@/server/support';
import { usePush } from '@/shared/firebase/use-push';
import { ChatComposer } from '@/shared/ui/chat/chat-composer';
import { useAttachment } from '@/shared/ui/chat/use-attachment';
import {
  useConversationInbox,
  useConversationMessages,
} from '@/shared/firebase/use-support-realtime';
import { formatClock, formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/lib/hooks';
import { Badge } from '@/shared/ui/primitives/badge';

import { ConfirmButton, QuietButton } from '../../../_components/admin-ui';
import { Panel } from '../../../../_console/components/page-header';
import { CONSOLE_APP } from '../../../../_lib/console-app';

/**
 * Live support, on real conversations.
 *
 * ── Two panes: who is waiting, and what they said ─────────────────────────────
 * The design had three — list, thread, and a context panel about the customer —
 * and filters above them for Open, Mine and All. Both are gone. An inbox this size
 * is read by looking at it, and the account details had one useful line ("on the
 * site now, reading…") which now sits in the thread where an agent is already
 * looking; the rest was a second place to keep facts the account page owns.
 *
 * What is behind it: the conversations are Firestore documents, the customer beside
 * them is this platform's own identity record, and whether they are online and what
 * page they are reading comes from the presence heartbeat that already runs.
 *
 * ── One pane at a time on a phone ─────────────────────────────────────────────
 * Two columns side by side is a desktop layout. Narrow, the list is the screen
 * until a conversation is opened, and the thread is the screen after that, with a
 * way back. Which pane shows is CSS, not JavaScript, so the first paint is right
 * at every width; `wide` is read only to decide whether a thread is actually in
 * front of somebody, which is what clearing its unread badge should depend on.
 */

const PRIORITY_TONE: Record<ConversationPriority, 'down' | 'warn' | 'neutral' | 'accent'> = {
  urgent: 'down',
  high: 'warn',
  normal: 'neutral',
  low: 'accent',
};

/** Matches the presence heartbeat: a faster poll would learn nothing new. */
const CONTEXT_REFRESH_MS = 20_000;

/** Marks a reply shown before the server has confirmed it. */
const OPTIMISTIC_PREFIX = 'pending:';

export function SupportConsole({
  operatorId,
  initialConversations,
  initialCustomers,
  initialThread,
}: {
  operatorId: string;
  initialConversations: readonly ConversationDto[];
  initialCustomers: Readonly<Record<string, SupportCustomerDto>>;
  initialThread: { conversationId: string | null; messages: readonly MessageDto[] };
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialThread.conversationId);
  /**
   * Whether the thread is the pane in front of somebody on a narrow screen.
   *
   * False on arrival, so a phone opens on the list rather than on whichever
   * conversation the server happened to prefill. Irrelevant above `lg`, where both
   * panes are on screen at once.
   */
  const [opened, setOpened] = useState(false);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [customers, setCustomers] = useState(initialCustomers);
  const threadRef = useRef<HTMLDivElement>(null);

  const { attachment, setAttachment, uploading, error: uploadError, attach } = useAttachment();

  /**
   * Replies posted but not yet echoed back.
   *
   * The console used to rely entirely on the listener to show an agent their own
   * reply — "the listener carries the change back", which is true right up until
   * the listener cannot attach. Then the box clears, nothing appears, and the agent
   * has no way to tell whether the message was sent or swallowed. So it is shown
   * immediately and reconciled when the real one arrives.
   */
  const [pending, setPending] = useState<MessageDto[]>([]);

  const { conversations, status, reason } = useConversationInbox({
    enabled: true,
    initial: initialConversations,
  });

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    conversations[0] ??
    null;

  const confirmed = useConversationMessages({
    enabled: true,
    conversationId: selected?.id ?? null,
    initial: selected?.id === initialThread.conversationId ? initialThread.messages : [],
  });

  const messages = useMemo(() => {
    const seen = new Set(confirmed.map((message) => message.body));
    // Dropped by body rather than by id: the server assigns the real id, so the
    // optimistic copy can never match one.
    return [
      ...confirmed,
      ...pending.filter(
        (message) => message.conversationId === selected?.id && !seen.has(message.body),
      ),
    ];
  }, [confirmed, pending, selected?.id]);

  // ── Customer context, refreshed on the presence cadence ────────────────────
  // Two reasons to re-ask, on one request: a conversation can arrive from somebody
  // the first render had never heard of, and where a customer is goes stale within
  // a minute of being read.
  const ids = useMemo(
    () => [...new Set(conversations.map((conversation) => conversation.userId))].join(','),
    [conversations],
  );

  useEffect(() => {
    if (ids.length === 0) return;

    let stopped = false;
    let timer: number | null = null;
    const controller = new AbortController();

    const tick = async () => {
      // A hidden tab is nobody watching. Skipping the request entirely means a
      // console left open in a background window costs nothing.
      if (document.visibilityState === 'visible') {
        try {
          const response = await fetch(
            `/api/admin/support/customers?ids=${encodeURIComponent(ids)}`,
            { cache: 'no-store', signal: controller.signal },
          );
          if (response.ok && !stopped) {
            const body = (await response.json()) as {
              customers: Record<string, SupportCustomerDto>;
            };
            setCustomers(body.customers);
          }
        } catch {
          // A stale context panel is better than a broken one: the operator keeps
          // the name and the thread, and only "where they are" goes quiet.
        }
      }
      if (!stopped) timer = window.setTimeout(tick, CONTEXT_REFRESH_MS);
    };

    void tick();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [ids]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, selected?.id]);

  // Opening a thread on a phone leaves the page scrolled where the list was, with
  // the page header above it eating the screen. Bring the pane to the top so the
  // conversation and the reply box are what is in front of somebody.
  useEffect(() => {
    if (wide || !opened) return;
    threadRef.current?.parentElement?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [wide, opened, selected?.id]);

  const act = useCallback(async (conversationId: string, action: string) => {
    await fetch(`/api/support/conversations/${conversationId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    // No local state update: the listener carries the change back, which is also
    // what every other operator's console sees. Writing it here as well would show
    // this operator a result the others do not have yet.
  }, []);

  // Opening a thread clears its badge. Fired once per selection, not per render —
  // and only while the thread is actually on screen, which on a phone means the
  // operator tapped it. A badge cleared behind the list is a message nobody read.
  const read = useRef<string | null>(null);
  useEffect(() => {
    if (!wide && !opened) return;
    if (selected === null || selected.unreadForOperator === 0) return;
    if (read.current === selected.id) return;
    read.current = selected.id;
    void act(selected.id, 'mark-read');
  }, [selected, act, wide, opened]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (selected === null || (body.length === 0 && attachment === null) || sending) return;

    const optimistic: MessageDto = {
      id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
      conversationId: selected.id,
      author: 'operator',
      authorId: operatorId,
      body,
      attachmentId: attachment?.id ?? null,
      sentAt: new Date().toISOString(),
    };

    const sentAttachment = attachment;
    setDraft('');
    setAttachment(null);
    setPending((queue) => [...queue, optimistic]);
    setSending(true);

    try {
      const response = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: selected.id,
          body,
          ...(sentAttachment !== null ? { attachmentId: sentAttachment.id } : {}),
        }),
      });

      if (!response.ok) {
        // Both go back rather than being lost. Somebody typed the one and chose the
        // other, and the upload is still stored and still unclaimed.
        setDraft(body);
        setAttachment(sentAttachment);
        setPending((queue) => queue.filter((message) => message.id !== optimistic.id));
      }
    } catch {
      setDraft(body);
      setAttachment(sentAttachment);
      setPending((queue) => queue.filter((message) => message.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [draft, selected, sending, attachment, setAttachment, operatorId]);

  const customer = selected ? customers[selected.userId] : undefined;

  return (
    <>
      <div
        // Tells the push service worker this queue is on screen and updating itself,
        // so a new customer message is not also announced by the operating system.
        // Only while the listener is live: a console that is polling, or not
        // updating at all, still needs the notification.
        data-live-surface={status === 'live' ? 'support-queue' : undefined}
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <PushToggle operatorId={operatorId} />
          <p className="flex items-center gap-1.5 text-2xs text-fg-subtle">
            <span
              aria-hidden
              className={cn(
                'size-1.5 rounded-full',
                status === 'live' ? 'animate-pulse bg-up' : 'bg-warn',
              )}
            />
            {/* Named, not just flagged. This is an operator's screen, and the usual
                cause of a dead listener is a project setting nobody has flipped —
                "not receiving live updates" sends somebody reading network traces. */}
            {status === 'live'
              ? 'Live'
              : status === 'connecting'
                ? 'Connecting…'
                : status === 'polling'
                  ? `Polling every few seconds${reason ? ` — ${reason}` : ''}`
                  : 'Not receiving updates'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr]">
        <Panel
          padded={false}
          className={cn(
            'min-w-0 overflow-hidden lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto',
            // On a phone the thread takes the screen, and this is what it takes it
            // from. One display utility at a time: `hidden` and `block` together
            // resolve by stylesheet order, not by the order written here.
            opened ? 'hidden lg:block' : 'block',
          )}
        >
          {conversations.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-fg-subtle">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRow
                    conversation={conversation}
                    customer={customers[conversation.userId]}
                    active={selected?.id === conversation.id}
                    onSelect={() => {
                      setSelectedId(conversation.id);
                      setOpened(true);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected ? (
          <Panel
            padded={false}
            className={cn(
              'min-w-0 flex-col lg:max-h-[calc(100dvh-12rem)]',
              // `flex` and `hidden` in one class list is decided by stylesheet
              // order rather than by this one — which is how the back button came
              // to leave the thread on screen. Exactly one of them applies.
              opened ? 'flex' : 'hidden lg:flex',
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
              <button
                type="button"
                onClick={() => setOpened(false)}
                aria-label="Back to conversations"
                className="-ml-1 grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg lg:hidden"
              >
                <ChevronLeft className="size-4" />
              </button>

              <div className="min-w-0 flex-1">
                {/* Who, then what about: the context panel used to carry the name,
                    and an agent replying to somebody should see it without it. */}
                <h2 className="truncate text-sm font-semibold text-fg">
                  {customer?.email ?? selected.userId}
                </h2>
                {/* One line that truncates, rather than a wrapping row: narrow, the
                    wrapping version stacked three words into a column. */}
                <p className="mt-0.5 truncate text-2xs text-fg-subtle">
                  <span>{selected.subject}</span>
                  <span aria-hidden> · </span>
                  <span>opened {formatDate(selected.openedAt)}</span>
                  {selected.status === 'resolved' ? (
                    <>
                      <span aria-hidden> · </span>
                      <span className="text-up">resolved</span>
                    </>
                  ) : null}
                </p>
              </div>
              {/* Their own row on a phone, where three buttons beside the name left
                  it four characters wide. Inline again once there is room. */}
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto">
                {/* The one link the removed panel is missed for: everything else it
                    held is on the account page this opens. */}
                <Link
                  href={`/admin/users/${selected.userId}`}
                  className="text-2xs font-medium text-brand-soft hover:underline"
                >
                  Account
                </Link>
                {selected.assignedTo !== operatorId ? (
                  <QuietButton onClick={() => void act(selected.id, 'claim')}>
                    <UserPlus className="size-3.5" />
                    Claim
                  </QuietButton>
                ) : null}
                {selected.status !== 'resolved' ? (
                  <ConfirmButton onClick={() => void act(selected.id, 'resolve')}>
                    <Check className="size-3.5" />
                    Resolve
                  </ConfirmButton>
                ) : null}
              </div>
            </div>

            {/* Capped on a phone so the reply box stays on screen under it: the
                transcript scrolls inside this box rather than growing the page
                until the composer is below the fold. */}
            <div
              ref={threadRef}
              className="min-h-64 max-h-[52dvh] flex-1 space-y-3 overflow-y-auto p-4 lg:max-h-none"
            >
              {messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}

              {customer?.live ? (
                <p className="flex items-center gap-1.5 text-2xs text-fg-subtle" aria-live="polite">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-up" />
                  {/* Real presence, from the heartbeat that drives the live board —
                      not a flag on the conversation. It tells an agent whether the
                      person is still there, and what they are looking at. */}
                  On the site now, reading{' '}
                  <span className="font-mono text-fg-muted">{customer.live.path}</span>
                </p>
              ) : null}
            </div>

            {uploadError !== null ? (
              <p
                role="status"
                className="border-t border-down/35 bg-down/8 px-4 py-2 text-2xs text-fg"
              >
                {uploadError}
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
              placeholder="Reply to the customer"
            />
          </Panel>
        ) : (
          <Panel className="hidden place-items-center text-xs text-fg-subtle lg:grid">
            Select a conversation.
          </Panel>
        )}
      </div>
    </>
  );
}

/**
 * Turns on notifications for this browser.
 *
 * A button, not something that happens on load: a permission prompt fired without
 * a gesture is denied by the person and increasingly blocked by the browser — and
 * a denial is sticky, curable only by the operator finding a setting.
 */
function PushToggle({ operatorId }: { operatorId: string }) {
  const { state, error, enable } = usePush(operatorId, CONSOLE_APP.scope);

  if (state === 'unconfigured') return null;

  if (state === 'unsupported') {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-fg-subtle">
        <BellOff className="size-3" />
        {/* On iOS this is what it means, and there is nothing code can do about it. */}
        Notifications unavailable in this browser
      </span>
    );
  }

  if (state === 'granted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-up">
        <Bell className="size-3" />
        Notifications on
      </span>
    );
  }

  if (state === 'denied') {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-fg-subtle">
        <BellOff className="size-3" />
        Notifications blocked — allow them in your browser settings
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => void enable()}
        disabled={state === 'working'}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-2xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
      >
        {state === 'working' ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Bell className="size-3" />
        )}
        Notify me
      </button>
      {/* Said, not swallowed. A button that quietly returned to "Notify me" after a
          failed attempt was indistinguishable from one that was never pressed. */}
      {error !== null ? (
        <span role="alert" className="text-2xs text-down">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function ConversationRow({
  conversation,
  customer,
  active,
  onSelect,
}: {
  conversation: ConversationDto;
  customer: SupportCustomerDto | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full px-4 py-3 text-left transition-colors',
        active ? 'bg-surface-hover' : 'hover:bg-surface',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="relative grid size-7 shrink-0 place-items-center rounded-full bg-brand/20 text-2xs font-semibold text-brand-soft"
        >
          {(customer?.email ?? '?').slice(0, 2).toUpperCase()}
          {customer?.live ? (
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg-elev bg-up" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
          {/* The id, never a placeholder name, when the directory could not answer:
              an operator can act on an id, and "Unknown" cannot be looked up. */}
          {customer?.email ?? conversation.userId}
        </span>
        <span className="shrink-0 text-2xs text-fg-subtle">
          {formatClock(conversation.lastMessageAt)}
        </span>
      </span>
      <span className="mt-1.5 block truncate text-xs text-fg">{conversation.subject}</span>
      <span className="mt-0.5 block truncate text-2xs text-fg-subtle">
        {conversation.lastMessagePreview}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONE[conversation.priority]}>{conversation.priority}</Badge>
        {conversation.status === 'resolved' ? <Badge tone="up">resolved</Badge> : null}
        {conversation.unreadForOperator > 0 ? (
          <Badge tone="brand">{conversation.unreadForOperator} new</Badge>
        ) : null}
        {conversation.assignedTo === null ? (
          <span className="text-2xs text-warn">· unassigned</span>
        ) : null}
      </span>
    </button>
  );
}

function Bubble({ message }: { message: MessageDto }) {
  if (message.author === 'system') {
    return <p className="text-center text-2xs leading-relaxed text-fg-subtle">{message.body}</p>;
  }

  const mine = message.author === 'operator';

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3.5 py-2.5',
          mine
            ? 'rounded-br-sm bg-brand/15 text-fg'
            : 'rounded-bl-sm border border-line bg-bg-sunken/70 text-fg',
        )}
      >
        {message.attachmentId !== null ? (
          <a
            href={`/api/support/attachments/${message.attachmentId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mb-2 block overflow-hidden rounded border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image would proxy this through the optimiser, which caches by
                URL and would leave a customer's screenshot in a shared cache. A
                plain img keeps it on the no-store route that authorises every
                request. */}
            <img
              src={`/api/support/attachments/${message.attachmentId}`}
              alt="Image sent by the customer"
              className="max-h-72 w-full bg-surface object-contain"
            />
          </a>
        ) : null}
        {message.body.length > 0 ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        ) : null}
        <p className="mt-1.5 text-2xs text-fg-subtle">
          {mine ? 'Agent' : 'Customer'} · {formatClock(message.sentAt)}
        </p>
      </div>
    </div>
  );
}
