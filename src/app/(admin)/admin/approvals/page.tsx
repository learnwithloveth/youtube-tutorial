'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Check, CircleAlert, Signature, UserCheck, X,
} from 'lucide-react';
import { AdminPageHeader, ConfirmButton, DangerButton, EmptyState, QuietButton, RiskBadge } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { ASSETS } from '../../../_console/data/assets';
import { useAdmin } from '../../_data/store';
import { ACTING_ADMIN } from '../../_data/data';
import { dateTimeLabel, money, moneyExact } from '../../../_console/data/format';
import { formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import type { Approval } from '../../_data/types';

const FILTERS = [
  { value: 'queue', label: 'In queue' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'decided', label: 'Decided' },
] as const;

type FilterKey = (typeof FILTERS)[number]['value'];

const SEVERITY_DOT: Record<string, string> = {
  low: 'bg-up', medium: 'bg-fg-subtle', high: 'bg-warn', critical: 'bg-down',
};

/** A second, named approver — dual control needs two people, not two clicks. */
const COUNTERSIGNER = 'Priya Raman';

export default function ApprovalsPage() {

  const { state, run, actor } = useAdmin();
  const [filter, setFilter] = useState<FilterKey>('queue');
  const [selectedId, setSelectedId] = useState<string | null>(state.approvals[0]?.id ?? null);
  const [reason, setReason] = useState('');

  const rows = useMemo(() => {
    const inQueue = (a: Approval) => a.state === 'pending' || a.state === 'escalated';
    if (filter === 'queue') return state.approvals.filter(inQueue);
    if (filter === 'decided') return state.approvals.filter((a) => !inQueue(a));
    return state.approvals.filter((a) => inQueue(a) && a.kind === filter);
  }, [state.approvals, filter]);

  const selected = state.approvals.find((a) => a.id === selectedId) ?? rows[0] ?? null;
  const user = selected ? state.users.find((u) => u.id === selected.userId) : undefined;
  const asset = selected ? ASSETS.find((a) => a.symbol === selected.asset) : undefined;

  const queued = state.approvals.filter((a) => a.state === 'pending' || a.state === 'escalated');
  const heldValue = queued.reduce((s, a) => s + a.value, 0);
  const awaitingSecond = queued.filter((a) => a.firstApprover).length;

  // The acting admin cannot complete a dual-control item they already signed.
  const signedByMe = selected?.firstApprover === actor;
  const needsCountersign = Boolean(selected?.requiresDualControl && signedByMe);

  return (
    <>
      <AdminPageHeader
        title="Approvals"
        description={`Deposits and withdrawals held for a decision. Anything at or above ${money(ACTING_ADMIN.dualControlThreshold)} needs two different approvers.`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="In the queue" value={String(queued.length)} delta={{ value: `${queued.filter((a) => a.kind === 'withdrawal').length} withdrawals`, direction: 'flat', period: '' }} />
        <StatTile label="Value held" value={money(heldValue)} delta={{ value: 'Not yet released', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Awaiting a second signature" value={String(awaitingSecond)} delta={{ value: 'Dual control', direction: 'flat', period: 'policy' }} />
        <StatTile label="Escalated" value={String(queued.filter((a) => a.state === 'escalated').length)} delta={{ value: 'Compliance review', direction: 'flat', period: '' }} upIsGood={false} />
      </div>

      <SegmentedControl
        ariaLabel="Filter approvals"
        className="mb-4"
        size="sm"
        segments={FILTERS}
        value={filter}
        onChange={setFilter}
      />

      {rows.length === 0 ? (
        <EmptyState title="Queue is clear" body="Nothing is waiting on a decision in this view. New submissions appear here the moment they are held." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_24rem] 2xl:grid-cols-[1fr_28rem]">
          <Panel padded={false} className="min-w-0 overflow-hidden">
            <ul className="divide-y divide-line/60">
              {rows.map((item) => {
                const rowUser = state.users.find((u) => u.id === item.userId);
                const active = selected?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        active ? 'bg-surface-hover' : 'hover:bg-surface',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full border border-line',
                          item.kind === 'withdrawal' ? 'text-down' : 'text-up',
                        )}
                      >
                        {item.kind === 'withdrawal' ? <ArrowUpFromLine className="size-3.5" /> : <ArrowDownToLine className="size-3.5" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-fg">
                            {moneyExact(item.value)}
                          </span>
                          <span className="shrink-0 font-mono text-2xs text-fg-subtle">{item.asset}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-fg-subtle">
                          {rowUser?.handle} · {item.network} · {dateTimeLabel(item.submittedAt)}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-2">
                        {item.firstApprover && item.state === 'pending' ? (
                          <Badge tone="brand">
                            <Signature className="size-3" />1 of 2
                          </Badge>
                        ) : null}
                        {item.state === 'approved' ? <Badge tone="up">Approved</Badge> : null}
                        {item.state === 'rejected' ? <Badge tone="down">Rejected</Badge> : null}
                        {item.state === 'escalated' ? <Badge tone="warn">Escalated</Badge> : null}
                        <RiskBadge risk={item.risk} score={item.riskScore} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {selected ? (
            <div className="space-y-4">
              <Panel>
                <div className="flex items-start gap-3">
                  {asset ? <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} size="lg" /> : null}
                  <div className="min-w-0">
                    <p className="font-sans text-2xl font-semibold tabular-nums text-fg">{moneyExact(selected.value)}</p>
                    <p className="text-sm text-fg-muted">
                      {formatQuantity(selected.quantity, 6)} {selected.asset} · {selected.network}
                    </p>
                  </div>
                </div>

                <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-xs">
                  {[
                    ['Type', selected.kind === 'withdrawal' ? 'Withdrawal' : 'Deposit'],
                    ['Customer', `${user?.name ?? '—'} (${user?.handle ?? '—'})`],
                    ['Account state', user?.state ?? '—'],
                    ['KYC', user?.kyc ?? '—'],
                    ['Destination', selected.destination],
                    ['Submitted', dateTimeLabel(selected.submittedAt)],
                    ['Reference', selected.id],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="shrink-0 text-fg-subtle">{k}</dt>
                      <dd className="truncate text-right font-mono text-fg-muted">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel>
                <h2 className="mb-1 font-display text-sm font-semibold text-fg">Risk signals</h2>
                <p className="mb-4 text-2xs text-fg-subtle">
                  Score {selected.riskScore} of 100 — the decision is still yours.
                </p>
                <ul className="space-y-3">
                  {selected.signals.map((signal, i) => (
                    <li key={`${signal.label}-${i}`} className="flex gap-2.5">
                      <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', SEVERITY_DOT[signal.severity])} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg">{signal.label}</p>
                        <p className="mt-0.5 text-2xs leading-relaxed text-fg-subtle">{signal.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                {selected.requiresDualControl ? (
                  <div className="mb-4 flex gap-2.5 rounded-md border border-brand-soft/30 bg-brand/8 p-3">
                    <Signature className="mt-0.5 size-3.5 shrink-0 text-brand-soft" />
                    <p className="text-2xs leading-relaxed text-fg-muted">
                      {selected.firstApprover
                        ? `Signed by ${selected.firstApprover}. A different approver must countersign — the same person cannot complete it.`
                        : `At or above ${money(ACTING_ADMIN.dualControlThreshold)}, this needs two different approvers.`}
                    </p>
                  </div>
                ) : null}

                {selected.state === 'approved' || selected.state === 'rejected' ? (
                  <div className="rounded-md border border-line bg-bg-sunken/60 p-3">
                    <p className="text-xs font-medium text-fg">
                      {selected.state === 'approved' ? 'Approved' : 'Rejected'}
                      {selected.decidedAt ? ` · ${dateTimeLabel(selected.decidedAt)}` : ''}
                    </p>
                    {selected.note ? <p className="mt-1 text-2xs text-fg-subtle">{selected.note}</p> : null}
                    {selected.secondApprover ? (
                      <p className="mt-1 text-2xs text-fg-subtle">
                        Signatures: {selected.firstApprover}, {selected.secondApprover}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-xs text-fg-muted">Decision note</span>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="Required when rejecting; recorded in the audit log either way."
                        className="w-full rounded-md border border-line bg-bg-sunken/60 px-3 py-2 text-xs text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {needsCountersign ? (
                        <ConfirmButton
                          tone="brand"
                          onClick={() => {
                            run({ type: 'approval/sign', id: selected.id, actor: COUNTERSIGNER, note: reason || undefined });
                            setReason('');
                          }}
                        >
                          <UserCheck className="size-3.5" />
                          Countersign as {COUNTERSIGNER}
                        </ConfirmButton>
                      ) : (
                        <ConfirmButton
                          onClick={() => {
                            run({ type: 'approval/sign', id: selected.id, note: reason || undefined });
                            setReason('');
                          }}
                        >
                          <Check className="size-3.5" />
                          {selected.requiresDualControl && !selected.firstApprover ? 'Sign (1 of 2)' : 'Approve & release'}
                        </ConfirmButton>
                      )}

                      <DangerButton
                        disabled={reason.trim().length === 0}
                        onClick={() => {
                          run({ type: 'approval/reject', id: selected.id, reason: reason.trim() });
                          setReason('');
                        }}
                      >
                        <X className="size-3.5" />
                        Reject
                      </DangerButton>

                      {selected.state !== 'escalated' ? (
                        <QuietButton onClick={() => run({ type: 'approval/escalate', id: selected.id })}>
                          <CircleAlert className="size-3.5" />
                          Escalate
                        </QuietButton>
                      ) : null}
                    </div>

                    {reason.trim().length === 0 ? (
                      <p className="mt-2 text-2xs text-fg-subtle">
                        A rejection needs a reason — the customer and the auditor both read it.
                      </p>
                    ) : null}
                  </>
                )}
              </Panel>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
