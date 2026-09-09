'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Ban, Search, ShieldCheck, Snowflake, StickyNote, X } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, DangerButton, QuietButton } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin } from '../../_data/store';
import { dateTimeLabel, money } from '../../../_console/data/format';
import { formatCompact, formatDate } from '@/shared/lib/format';
import { useEscape } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/cn';
import type { AdminUser, KycState, UserState } from '../../_data/types';

const STATE_TONE: Record<UserState, 'up' | 'warn' | 'down' | 'neutral'> = {
  active: 'up', restricted: 'warn', frozen: 'down', closed: 'neutral',
};
const KYC_TONE: Record<KycState, 'up' | 'warn' | 'down' | 'neutral' | 'accent'> = {
  verified: 'up', pending: 'accent', review: 'warn', rejected: 'down', unverified: 'neutral',
};

const FILTERS = ['all', 'active', 'restricted', 'frozen'] as const;

export default function UsersPage() {

  const { state, run } = useAdmin();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const deferred = useDeferredValue(query);

  useEscape(() => setOpenId(null), openId !== null);

  const rows = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    return state.users.filter((user) => {
      const matchesFilter = filter === 'all' || user.state === filter;
      const matchesQuery =
        !needle ||
        user.name.toLowerCase().includes(needle) ||
        user.handle.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.id.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [state.users, deferred, filter]);

  const open: AdminUser | undefined = state.users.find((u) => u.id === openId);

  const setUserState = (next: UserState) => {
    if (!open || reason.trim().length === 0) return;
    run({ type: 'user/setState', id: open.id, state: next, reason: reason.trim() });
    setReason('');
  };

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Every account, with the controls that change one. Each action needs a reason and lands in the audit log."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Accounts" value={String(state.users.length)} delta={{ value: `${state.users.filter((u) => u.state === 'active').length} active`, direction: 'flat', period: '' }} />
        <StatTile label="Restricted" value={String(state.users.filter((u) => u.state === 'restricted').length)} delta={{ value: 'Partial controls', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Frozen" value={String(state.users.filter((u) => u.state === 'frozen').length)} delta={{ value: 'No movement permitted', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Custody held" value={money(state.users.reduce((s, u) => s + u.balance, 0))} delta={{ value: 'Across these accounts', direction: 'flat', period: '' }} />
      </div>

      <Panel>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative w-full max-w-xs">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, handle, email or account id"
              className="h-9 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
            />
          </label>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  'rounded-full border px-3 py-1 text-2xs capitalize transition-colors',
                  filter === f
                    ? 'border-brand-soft/60 bg-brand/15 text-fg'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <TableShell caption="Customer accounts" minWidth="54rem">
          <thead>
            <tr>
              <Th>Account</Th><Th>State</Th><Th>KYC</Th>
              <Th numeric>Balance</Th><Th numeric>30d volume</Th>
              <Th numeric>Risk</Th><Th>Joined</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>No accounts match that search.</EmptyRow>
            ) : (
              rows.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="grid size-8 shrink-0 place-items-center rounded-full text-2xs font-semibold text-white"
                        style={{ background: `linear-gradient(140deg, ${user.hue}, color-mix(in oklab, ${user.hue} 40%, #05060b))` }}
                      >
                        {user.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
                        <span className="block truncate text-2xs text-fg-subtle">{user.handle} · {user.country}</span>
                      </span>
                    </span>
                  </Td>
                  <Td><Badge tone={STATE_TONE[user.state]} className="capitalize">{user.state}</Badge></Td>
                  <Td><Badge tone={KYC_TONE[user.kyc]} className="capitalize">{user.kyc}</Badge></Td>
                  <Td numeric className="font-medium text-fg">{money(user.balance)}</Td>
                  <Td numeric>{formatCompact(user.volume30d, 'USD')}</Td>
                  <Td numeric>
                    <span className={cn(user.riskScore > 70 ? 'text-down' : user.riskScore > 40 ? 'text-warn' : 'text-fg-muted')}>
                      {user.riskScore}
                    </span>
                  </Td>
                  <Td>{formatDate(user.joined)}</Td>
                  <Td numeric>
                    <QuietButton onClick={() => setOpenId(user.id)}>Manage</QuietButton>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableShell>
      </Panel>

      {/* Detail drawer — the account controls live behind a deliberate step. */}
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setOpenId(null)}
            className="absolute inset-0 bg-bg-sunken/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${open.name}`}
            className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-bg-elev"
          >
            <div className="sticky top-0 flex items-center gap-3 border-b border-line bg-bg-elev px-5 py-4">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ background: `linear-gradient(140deg, ${open.hue}, color-mix(in oklab, ${open.hue} 40%, #05060b))` }}
              >
                {open.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{open.name}</p>
                <p className="truncate text-2xs text-fg-subtle">{open.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-sm text-fg-subtle hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <dl className="grid grid-cols-2 gap-4 text-xs">
                {[
                  ['Account id', open.id], ['Tier', open.tier], ['Country', open.country],
                  ['Balance', money(open.balance)], ['30d volume', formatCompact(open.volume30d, 'USD')],
                  ['Open orders', String(open.openOrders)], ['Risk score', String(open.riskScore)],
                  ['Joined', formatDate(open.joined)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-fg-subtle">{k}</dt>
                    <dd className="mt-0.5 truncate font-mono text-fg">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex gap-2">
                <Badge tone={STATE_TONE[open.state]} className="capitalize">{open.state}</Badge>
                <Badge tone={KYC_TONE[open.kyc]} className="capitalize">KYC {open.kyc}</Badge>
              </div>

              <div className="rounded-md border border-line bg-bg-sunken/60 p-4">
                <h3 className="text-xs font-semibold text-fg">Change account state</h3>
                <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">
                  Freezing halts trading, withdrawals and deposits immediately. The customer sees the
                  state and the reason.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Reason — required, and recorded against your name"
                  className="mt-3 w-full rounded-md border border-line bg-bg-elev px-3 py-2 text-xs text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <ConfirmButton disabled={reason.trim().length === 0 || open.state === 'active'} onClick={() => setUserState('active')}>
                    <ShieldCheck className="size-3.5" />
                    Reinstate
                  </ConfirmButton>
                  <QuietButton disabled={reason.trim().length === 0 || open.state === 'restricted'} onClick={() => setUserState('restricted')}>
                    <Ban className="size-3.5" />
                    Restrict
                  </QuietButton>
                  <DangerButton disabled={reason.trim().length === 0 || open.state === 'frozen'} onClick={() => setUserState('frozen')}>
                    <Snowflake className="size-3.5" />
                    Freeze
                  </DangerButton>
                </div>
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold text-fg">
                  <StickyNote className="size-3.5 text-brand-soft" />
                  Notes
                </h3>
                <div className="mt-3 flex gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note visible to every agent"
                    className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg-sunken/60 px-3 text-xs text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
                  />
                  <QuietButton
                    disabled={note.trim().length === 0}
                    onClick={() => {
                      run({ type: 'user/note', id: open.id, body: note.trim() });
                      setNote('');
                    }}
                  >
                    Add
                  </QuietButton>
                </div>
                <ul className="mt-3 space-y-2">
                  {open.notes.length === 0 ? (
                    <li className="text-2xs text-fg-subtle">No notes on this account yet.</li>
                  ) : (
                    open.notes.map((entry) => (
                      <li key={entry.id} className="rounded-md border border-line bg-bg-sunken/60 p-3">
                        <p className="text-2xs leading-relaxed text-fg-muted">{entry.body}</p>
                        <p className="mt-1.5 text-2xs text-fg-subtle">
                          {entry.author} · {dateTimeLabel(entry.at)}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
