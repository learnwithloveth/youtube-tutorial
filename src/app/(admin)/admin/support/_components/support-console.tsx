'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  BellOff,
  Check,
  Loader2,
  MapPin,
  MessageSquare,
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
import { Badge } from '@/shared/ui/primitives/badge';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';

import { ConfirmButton, QuietButton } from '../../../_components/admin-ui';
import { Panel } from '../../../../_console/components/page-header';

/**
 * Live support, on real conversations.
 *
 * ── What changed under the design ──────────────────────────────────────────────
 * The layout is the approved one: list, thread, customer context. What is behind
 * it is different. It used to reduce over an in-memory fixture — invented
 * customers, invented balances, a risk score from `Math.random()`, and a reload
 * that reset every reply. Now the conversations are Firestore documents, the
 * customer beside them is this platform's own identity record, and whether they
 * are online and what page they are reading comes from the presence heartbeat
 * that already runs.
 *
 * Three fields from the original context panel are gone rather than
 * reimplemented — 30-day volume, open orders and a risk score. There is no trading
 * engine and no surveillance context, so all three were constants, and a number an
 * agent might repeat to a customer is the worst place to keep one.
 *
 * ── Filtering happens here, not in Firestore ───────────────────────────────────
 * One listener over the whole inbox, and Open/Mine/All filter it in memory. An
 * inbox is tens of rows; three queries would be three listeners, three composite
 * indexes, and a tab switch that waits for a network round trip.
 */

const VIEWS = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
] as const;

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
  const [view, setView] = useState<'open' | 'mine' | 'all'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(initialThread.conversationId);
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

  const visible = useMemo(() => {
    if (view === 'all') return conversations;
    if (view === 'mine') {
      return conversations.filter((conversation) => conversation.assignedTo === operatorId);
    }
    return conversations.filter((conversation) => conversation.status === 'open');
  }, [conversations, view, operatorId]);

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ?? visible[0] ?? null;

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

  // Opening a thread clears its badge. Fired once per selection, not per render.
  const read = useRef<string | null>(null);
  useEffect(() => {
    if (selected === null || selected.unreadForOperator === 0) return;
    if (read.current === selected.id) return;
    read.current = selected.id;
    void act(selected.id, 'mark-read');
  }, [selected, act]);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Filter conversations"
          size="sm"
          segments={VIEWS}
          value={view}
          onChange={setView}
        />
        <div className="flex flex-wrap items-center gap-3">
          <PushToggle />
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

      <div className="grid gap-4 xl:grid-cols-[19rem_1fr_18rem] 2xl:grid-cols-[21rem_1fr_20rem]">
        <Panel
          padded={false}
          className="min-w-0 overflow-hidden xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto"
        >
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-fg-subtle">
              {view === 'open'
                ? 'No open conversations.'
                : view === 'mine'
                  ? 'Nothing assigned to you.'
                  : 'No conversations yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {visible.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRow
                    conversation={conversation}
                    customer={customers[conversation.userId]}
                    active={selected?.id === conversation.id}
                    onSelect={() => setSelectedId(conversation.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected ? (
          <Panel padded={false} className="flex min-w-0 flex-col xl:max-h-[calc(100dvh-13rem)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-fg">{selected.subject}</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-fg-subtle">
                  <span>Live chat</span>
                  <span aria-hidden>·</span>
                  <span>opened {formatDate(selected.openedAt)}</span>
                  {selected.status === 'resolved' ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-up">resolved</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
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

            <div ref={threadRef} className="min-h-64 flex-1 space-y-3 overflow-y-auto p-4">
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
          <Panel className="grid place-items-center text-xs text-fg-subtle">
            Select a conversation.
          </Panel>
        )}

        {selected ? (
          <CustomerContext conversation={selected} customer={customer} />
        ) : null}
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
function PushToggle() {
  const { state, enable } = usePush();

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

function CustomerContext({
  conversation,
  customer,
}: {
  conversation: ConversationDto;
  customer: SupportCustomerDto | undefined;
}) {
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-full bg-brand/20 text-sm font-semibold text-brand-soft"
          >
            {(customer?.email ?? '?').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">
              {customer?.email ?? 'Directory unavailable'}
            </p>
            <p className="truncate font-mono text-2xs text-fg-subtle">{conversation.userId}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-xs">
          <Row label="Account" value={customer?.status ?? '—'} />
          <Row
            label="On the site"
            value={
              customer?.live
                ? customer.live.activity === 'active'
                  ? 'Active now'
                  : 'Idle'
                : 'Not right now'
            }
          />
          {customer?.live ? (
            <Row label="Reading" value={customer.live.path} />
          ) : null}
          {customer?.live?.city || customer?.live?.country ? (
            <Row
              label="Location"
              value={[customer.live.city, customer.live.country].filter(Boolean).join(', ')}
              icon={<MapPin className="size-3" />}
            />
          ) : null}
          <Row label="Conversation" value={conversation.status} />
          <Row label="Opened" value={formatDate(conversation.openedAt)} />
        </dl>

        <div className="mt-4 flex flex-col gap-1.5">
          <Link
            href={`/admin/users/${conversation.userId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-soft hover:underline"
          >
            Open full account
          </Link>
          <Link
            href="/admin/transactions"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-soft hover:underline"
          >
            Their transactions
          </Link>
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <MessageSquare className="size-3.5 text-brand-soft" />
          What is not here
        </h2>
        {/* Said plainly rather than filled with plausible numbers. The panel used
            to show a 30-day volume, open orders and a risk score; there is no
            trading engine and no surveillance context, so every one of them was a
            constant an agent might have repeated to a customer. */}
        <p className="text-2xs leading-relaxed text-fg-subtle">
          Trading volume, open orders and risk scoring are not shown because nothing
          on this platform measures them yet. Balances, deposits and withdrawals are
          real — open the full account to see them.
        </p>
      </Panel>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-fg-subtle">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 truncate text-right font-mono text-fg-muted">
        {icon}
        {value}
      </dd>
    </div>
  );
}
