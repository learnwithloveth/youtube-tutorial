'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CornerDownLeft, MessageSquare, Sparkles, UserPlus } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, QuietButton } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { Badge } from '@/shared/ui/primitives/badge';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { useAdmin } from '../../_data/store';
import { CANNED_REPLIES } from '../../_data/data';
import { dateTimeLabel, money, timeLabel } from '../../../_console/data/format';
import { formatCompact } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import type { TicketPriority } from '../../_data/types';

const VIEWS = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
] as const;

const PRIORITY_TONE: Record<TicketPriority, 'down' | 'warn' | 'neutral' | 'accent'> = {
  urgent: 'down', high: 'warn', normal: 'neutral', low: 'accent',
};

export default function SupportPage() {

  const { state, run, actor } = useAdmin();
  const [view, setView] = useState<'open' | 'mine' | 'all'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(state.tickets[0]?.id ?? null);
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  const tickets = useMemo(() => {
    if (view === 'all') return state.tickets;
    if (view === 'mine') return state.tickets.filter((t) => t.assignee === actor || t.assignee === 'Lena Weber');
    return state.tickets.filter((t) => t.state !== 'resolved');
  }, [state.tickets, view, actor]);

  const selected = state.tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;
  const customer = selected ? state.users.find((u) => u.id === selected.userId) : undefined;

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [selected?.messages.length, selected?.id]);

  const send = () => {
    if (!selected || draft.trim().length === 0) return;
    run({ type: 'ticket/reply', id: selected.id, body: draft.trim() });
    setDraft('');
  };

  return (
    <>
      <AdminPageHeader
        title="Live support"
        description="Every conversation carries the customer's account beside it, so an agent never has to ask for a reference."
        actions={
          <SegmentedControl
            ariaLabel="Filter conversations"
            size="sm"
            segments={VIEWS}
            value={view}
            onChange={setView}
          />
        }
      />

      <div className="grid gap-4 xl:grid-cols-[19rem_1fr_18rem] 2xl:grid-cols-[21rem_1fr_20rem]">
        {/* Conversation list */}
        <Panel padded={false} className="min-w-0 overflow-hidden xl:max-h-[calc(100dvh-11rem)] xl:overflow-y-auto">
          <ul className="divide-y divide-line/60">
            {tickets.map((ticket) => {
              const user = state.users.find((u) => u.id === ticket.userId);
              const last = ticket.messages[ticket.messages.length - 1];
              const active = selected?.id === ticket.id;
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(ticket.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors',
                      active ? 'bg-surface-hover' : 'hover:bg-surface',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="relative grid size-7 shrink-0 place-items-center rounded-full text-2xs font-semibold text-white"
                        style={{ background: `linear-gradient(140deg, ${user?.hue ?? '#8B5CF6'}, color-mix(in oklab, ${user?.hue ?? '#8B5CF6'} 40%, #05060b))` }}
                      >
                        {user?.initials}
                        {ticket.online ? (
                          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg-elev bg-up" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{user?.name}</span>
                      <span className="shrink-0 text-2xs text-fg-subtle">{timeLabel(new Date(ticket.openedAt).getTime())}</span>
                    </span>
                    <span className="mt-1.5 block truncate text-xs text-fg">{ticket.subject}</span>
                    <span className="mt-0.5 block truncate text-2xs text-fg-subtle">{last?.body}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
                      {ticket.state === 'resolved' ? <Badge tone="up">resolved</Badge> : null}
                      {ticket.assignee ? (
                        <span className="text-2xs text-fg-subtle">· {ticket.assignee.split(' ')[0]}</span>
                      ) : (
                        <span className="text-2xs text-warn">· unassigned</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Thread */}
        {selected ? (
          <Panel padded={false} className="flex min-w-0 flex-col xl:max-h-[calc(100dvh-11rem)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-fg">{selected.subject}</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-fg-subtle">
                  <span>{selected.channel === 'chat' ? 'Live chat' : 'Email'}</span>
                  <span aria-hidden>·</span>
                  <span>opened {dateTimeLabel(selected.openedAt)}</span>
                  {selected.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-line px-1.5 py-0.5 font-mono">
                      {tag}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!selected.assignee ? (
                  <QuietButton onClick={() => run({ type: 'ticket/assign', id: selected.id })}>
                    <UserPlus className="size-3.5" />
                    Claim
                  </QuietButton>
                ) : null}
                {selected.state !== 'resolved' ? (
                  <ConfirmButton onClick={() => run({ type: 'ticket/resolve', id: selected.id })}>
                    <Check className="size-3.5" />
                    Resolve
                  </ConfirmButton>
                ) : null}
              </div>
            </div>

            <div ref={threadRef} className="min-h-64 flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((message) => {
                const mine = message.from === 'agent';
                return (
                  <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3.5 py-2.5',
                        mine
                          ? 'rounded-br-sm bg-brand/15 text-fg'
                          : 'rounded-bl-sm border border-line bg-bg-sunken/70 text-fg',
                      )}
                    >
                      <p className="text-sm leading-relaxed">{message.body}</p>
                      <p className="mt-1.5 text-2xs text-fg-subtle">
                        {message.author} · {timeLabel(new Date(message.at).getTime())}
                      </p>
                    </div>
                  </div>
                );
              })}
              {selected.online && selected.state !== 'resolved' ? (
                <p className="flex items-center gap-1.5 text-2xs text-fg-subtle" aria-live="polite">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-up" />
                  {customer?.name.split(' ')[0]} is online
                </p>
              ) : null}
            </div>

            <div className="border-t border-line p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CANNED_REPLIES.map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    onClick={() => setDraft(reply.body)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-2xs text-fg-muted transition-colors hover:border-brand-soft/50 hover:text-fg"
                  >
                    <Sparkles className="size-3" />
                    {reply.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter is a newline — the convention every
                    // agent already has in their fingers.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder="Reply to the customer…  (Enter to send, Shift+Enter for a new line)"
                  className="min-h-16 flex-1 resize-none rounded-md border border-line bg-bg-sunken/60 px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
                />
                <ConfirmButton tone="brand" onClick={send} disabled={draft.trim().length === 0} className="h-9">
                  <CornerDownLeft className="size-3.5" />
                  Send
                </ConfirmButton>
              </div>
            </div>
          </Panel>
        ) : null}

        {/* Customer context */}
        {customer ? (
          <div className="space-y-4">
            <Panel>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ background: `linear-gradient(140deg, ${customer.hue}, color-mix(in oklab, ${customer.hue} 40%, #05060b))` }}
                >
                  {customer.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{customer.name}</p>
                  <p className="truncate text-2xs text-fg-subtle">{customer.handle} · {customer.country}</p>
                </div>
              </div>

              <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-xs">
                {[
                  ['Tier', customer.tier],
                  ['Balance', money(customer.balance)],
                  ['30-day volume', formatCompact(customer.volume30d, 'USD')],
                  ['Open orders', String(customer.openOrders)],
                  ['Account', customer.state],
                  ['KYC', customer.kyc],
                  ['Risk score', String(customer.riskScore)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-fg-subtle">{k}</dt>
                    <dd className="text-right font-mono text-fg-muted">{v}</dd>
                  </div>
                ))}
              </dl>

              <Link
                href="/admin/users"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand-soft hover:underline"
              >
                Open full account
              </Link>
            </Panel>

            <Panel>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-fg">
                <MessageSquare className="size-3.5 text-brand-soft" />
                Account notes
              </h2>
              {customer.notes.length === 0 ? (
                <p className="text-2xs leading-relaxed text-fg-subtle">
                  No notes on this account. Anything you add here is visible to every agent and
                  recorded in the audit log.
                </p>
              ) : (
                <ul className="space-y-3">
                  {customer.notes.map((note) => (
                    <li key={note.id} className="rounded-md border border-line bg-bg-sunken/60 p-3">
                      <p className="text-2xs leading-relaxed text-fg-muted">{note.body}</p>
                      <p className="mt-1.5 text-2xs text-fg-subtle">
                        {note.author} · {dateTimeLabel(note.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </>
  );
}
