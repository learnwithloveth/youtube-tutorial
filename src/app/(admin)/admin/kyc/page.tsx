'use client';

import { useState } from 'react';
import { Check, FileText, Fingerprint, ScanFace, TriangleAlert, UserPlus, X } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, DangerButton, EmptyState, QuietButton } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin } from '../../_data/store';
import { dateTimeLabel } from '../../../_console/data/format';
import { cn } from '@/shared/lib/cn';

const CHECK_TONE = { pass: 'text-up', warn: 'text-warn', fail: 'text-down' } as const;

export default function KycPage() {

  const { state, run } = useAdmin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const queue = state.kycCases.filter((c) => c.state === 'unassigned' || c.state === 'in_review');
  const selected = state.kycCases.find((c) => c.id === selectedId) ?? queue[0] ?? null;
  const user = selected ? state.users.find((u) => u.id === selected.userId) : undefined;

  const failing = selected?.checks.filter((c) => c.status !== 'pass') ?? [];

  return (
    <>
      <AdminPageHeader
        title="KYC review"
        description="Cases the automated checks could not clear on their own. Ninety-four percent never reach this queue."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Awaiting adjudication" value={String(queue.length)} delta={{ value: `${state.kycCases.filter((c) => c.state === 'in_review').length} in review`, direction: 'flat', period: '' }} />
        <StatTile label="Sanctions hits" value={String(state.kycCases.reduce((s, c) => s + c.sanctionsHits, 0))} delta={{ value: 'Manual adjudication required', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="PEP matches" value={String(state.kycCases.filter((c) => c.pepMatch).length)} delta={{ value: 'Enhanced due diligence', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Median decision" value="4h 12m" delta={{ value: '−38m', direction: 'down', period: 'vs last week' }} upIsGood={false} />
      </div>

      {queue.length === 0 ? (
        <EmptyState title="No cases waiting" body="Every submission has been adjudicated. New cases arrive here when an automated check cannot clear them." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
          <Panel padded={false} className="min-w-0 overflow-hidden">
            <ul className="divide-y divide-line/60">
              {queue.map((item) => {
                const caseUser = state.users.find((u) => u.id === item.userId);
                const active = selected?.id === item.id;
                const blocking = item.checks.some((c) => c.status === 'fail');
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn('w-full px-4 py-3 text-left transition-colors', active ? 'bg-surface-hover' : 'hover:bg-surface')}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{caseUser?.name}</span>
                        {blocking ? <Badge tone="down">Blocking</Badge> : null}
                        {item.state === 'in_review' ? <Badge tone="accent">In review</Badge> : null}
                      </span>
                      <span className="mt-1 block truncate text-2xs text-fg-subtle">
                        {item.document} · {item.country} · {dateTimeLabel(item.submittedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {selected && user ? (
            <div className="min-w-0 space-y-4">
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white"
                      style={{ background: `linear-gradient(140deg, ${user.hue}, color-mix(in oklab, ${user.hue} 40%, #05060b))` }}
                    >
                      {user.initials}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-fg">{user.name}</p>
                      <p className="text-2xs text-fg-subtle">
                        {user.handle} · {selected.country} · submitted {dateTimeLabel(selected.submittedAt)}
                      </p>
                    </div>
                  </div>
                  {selected.state === 'unassigned' ? (
                    <QuietButton onClick={() => run({ type: 'kyc/assign', id: selected.id })}>
                      <UserPlus className="size-3.5" />
                      Take this case
                    </QuietButton>
                  ) : (
                    <Badge tone="accent">Assigned to {selected.assignee}</Badge>
                  )}
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                {/* Document panel — a representation, never a real customer document. */}
                <Panel>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-fg">
                    <FileText className="size-3.5 text-brand-soft" />
                    {selected.document}
                  </h2>
                  <div className="aspect-[1.586] overflow-hidden rounded-md border border-line bg-bg-sunken">
                    <div className="grid h-full grid-cols-[1fr_2fr] gap-3 p-4">
                      <div className="grid place-items-center rounded-sm border border-line bg-surface">
                        <ScanFace className="size-8 text-fg-subtle" />
                      </div>
                      <div className="space-y-2">
                        {[
                          ['Surname', user.name.split(' ')[1]?.toUpperCase() ?? '—'],
                          ['Given names', user.name.split(' ')[0]?.toUpperCase() ?? '—'],
                          ['Nationality', selected.country],
                          ['Document no.', `${selected.country}${user.id.slice(-6).toUpperCase()}`],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <p className="font-mono text-[0.55rem] uppercase tracking-wider text-fg-subtle">{k}</p>
                            <p className="font-mono text-2xs text-fg">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="border-t border-line px-4 py-1.5 font-mono text-[0.55rem] tracking-[0.15em] text-fg-subtle">
                      P&lt;{selected.country}{user.name.replace(' ', '&lt;&lt;').toUpperCase()}&lt;&lt;&lt;&lt;&lt;&lt;&lt;
                    </p>
                  </div>
                  <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
                    Rendered representation. Real documents are held encrypted and deleted 90 days
                    after a decision unless retention is legally required.
                  </p>
                </Panel>

                <Panel>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-fg">
                    <Fingerprint className="size-3.5 text-brand-soft" />
                    Automated checks
                  </h2>
                  <ul className="space-y-3">
                    {selected.checks.map((check) => (
                      <li key={check.label} className="flex gap-2.5">
                        <span aria-hidden className={cn('mt-0.5 shrink-0', CHECK_TONE[check.status])}>
                          {check.status === 'pass' ? <Check className="size-3.5" /> : check.status === 'warn' ? <TriangleAlert className="size-3.5" /> : <X className="size-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg">
                            {check.label}
                            <span className={cn('ml-2 font-mono text-2xs uppercase', CHECK_TONE[check.status])}>
                              {check.status}
                            </span>
                          </p>
                          <p className="mt-0.5 text-2xs leading-relaxed text-fg-subtle">{check.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {selected.pepMatch ? (
                    <p className="mt-4 flex gap-2 rounded-md border border-warn/35 bg-warn/8 p-3 text-2xs leading-relaxed text-fg-muted">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warn" />
                      Politically exposed person match. Enhanced due diligence and senior sign-off
                      are required before approval.
                    </p>
                  ) : null}
                </Panel>
              </div>

              <Panel>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-fg-muted">Adjudication note</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="What decided it. Required on rejection."
                    className="w-full rounded-md border border-line bg-bg-sunken/60 px-3 py-2 text-xs text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ConfirmButton
                    disabled={failing.some((c) => c.status === 'fail')}
                    onClick={() => {
                      run({ type: 'kyc/decide', id: selected.id, approve: true, reason: reason.trim() || undefined });
                      setReason('');
                      setSelectedId(null);
                    }}
                  >
                    <Check className="size-3.5" />
                    Approve and verify
                  </ConfirmButton>
                  <DangerButton
                    disabled={reason.trim().length === 0}
                    onClick={() => {
                      run({ type: 'kyc/decide', id: selected.id, approve: false, reason: reason.trim() });
                      setReason('');
                      setSelectedId(null);
                    }}
                  >
                    <X className="size-3.5" />
                    Reject
                  </DangerButton>
                  {failing.some((c) => c.status === 'fail') ? (
                    <p className="text-2xs text-down">
                      A failing check blocks approval — clear it upstream or reject the case.
                    </p>
                  ) : null}
                </div>
              </Panel>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
