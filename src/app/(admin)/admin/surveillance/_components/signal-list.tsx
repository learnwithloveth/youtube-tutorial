'use client';

import { useActionState, useState } from 'react';
import { Check, ChevronUp, Flag } from 'lucide-react';

import type { RiskSignalDto } from '@/modules/ledger';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { triageRiskSignalAction } from '../_lib/actions';
import { IDLE_TRIAGE } from '../_lib/form-state';

/**
 * The findings, and the one decision an operator can record about each.
 *
 * ── Why each finding is a card and not a table row ────────────────────────────
 * The old table gave a pattern name, a percentage and a notional — five columns of
 * numbers to skim. What matters here is the *evidence*, which is a different shape
 * per rule: an address and an account count for one, two request ids and a rejection
 * reason for another. A table would force those into shared columns most of them do
 * not have, and the empty cells would be the ones nobody reads.
 */

export function SignalList({
  open,
  handled,
  accounts,
}: {
  open: readonly RiskSignalDto[];
  handled: readonly RiskSignalDto[];
  accounts: Readonly<Record<string, string>>;
}) {
  const [showHandled, setShowHandled] = useState(false);

  return (
    <div className="grid gap-4">
      {open.length === 0 ? (
        <Panel>
          <p className="text-xs text-fg-subtle">
            Nothing open. Everything the rules matched has been reviewed.
          </p>
        </Panel>
      ) : (
        open.map((signal) => (
          <SignalCard key={signal.key} signal={signal} accounts={accounts} />
        ))
      )}

      {handled.length === 0 ? null : (
        <div>
          <button
            type="button"
            onClick={() => setShowHandled((previous) => !previous)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronUp
              className={cn('size-3.5 transition-transform', showHandled ? '' : 'rotate-180')}
            />
            {showHandled ? 'Hide' : 'Show'} {handled.length} reviewed
          </button>

          {showHandled ? (
            <div className="mt-4 grid gap-4">
              {handled.map((signal) => (
                <SignalCard key={signal.key} signal={signal} accounts={accounts} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  accounts,
}: {
  signal: RiskSignalDto;
  accounts: Readonly<Record<string, string>>;
}) {
  const [state, submit, pending] = useActionState(triageRiskSignalAction, IDLE_TRIAGE);
  const [note, setNote] = useState('');

  const message = state.key === signal.key ? state.message : null;

  return (
    <Panel className={cn(signal.disposition !== null && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PanelHeader title={signal.title} subtitle={signal.description} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SeverityBadge severity={signal.severity} />
          {signal.disposition === null ? null : (
            <Badge tone={signal.disposition === 'escalated' ? 'down' : 'up'}>
              {signal.disposition === 'escalated' ? 'Escalated' : 'Cleared'}
            </Badge>
          )}
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {signal.evidence.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-xs text-fg-subtle">{item.label}</dt>
            <dd data-numeric className="min-w-0 break-all text-right text-xs text-fg">
              {item.value}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-xs text-fg-subtle">Observed</dt>
          <dd className="text-right text-xs text-fg">{formatDate(signal.observedAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-xs text-fg-subtle">
          {signal.subjects.length === 1 ? 'Account' : 'Accounts'}
        </span>
        {signal.subjects.map((subject) => (
          // Linked, because the next thing an operator does is open the account.
          <a
            key={subject}
            href={`/admin/users/${subject}`}
            className="truncate rounded-md border border-line px-2 py-1 text-2xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {/* The id when the directory could not answer — an operator can act on
                an id, and "Unknown" hides which account this is about. */}
            {accounts[subject] ?? subject}
          </a>
        ))}
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">{signal.rationale}</p>

      {signal.disposition === null ? (
        <form action={submit} className="mt-4 grid gap-2 border-t border-line pt-4">
          <input type="hidden" name="key" value={signal.key} />

          <input
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="What you found. Required to escalate."
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-xs text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              name="disposition"
              value="clear"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-medium text-up transition-colors hover:border-up/70 hover:bg-up/18 disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="size-3.5" />
              Clear
            </button>
            <button
              type="submit"
              name="disposition"
              value="escalate"
              // Disabled without a note rather than failing on submit: the rule is
              // knowable before the click.
              disabled={pending || note.trim().length === 0}
              title={note.trim().length === 0 ? 'Escalating needs a note' : undefined}
              className="inline-flex items-center gap-1.5 rounded-md border border-down/40 bg-down/10 px-3 py-1.5 text-xs font-medium text-down transition-colors hover:border-down/70 hover:bg-down/18 disabled:pointer-events-none disabled:opacity-40"
            >
              <Flag className="size-3.5" />
              Escalate
            </button>

            <span className="text-2xs text-fg-subtle">
              {/* Said next to the button, because "Escalate" reads like it does
                  something to the account and it does not. */}
              Recording a decision only — neither freezes an account.
            </span>
          </div>

          {message === null ? null : (
            <p className={cn('text-xs', state.status === 'error' ? 'text-down' : 'text-up')}>
              {message}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
          {signal.note ?? 'No note left.'}
          {signal.decidedAt === null ? null : ` · ${formatDate(signal.decidedAt)}`}
        </p>
      )}
    </Panel>
  );
}

function SeverityBadge({ severity }: { severity: RiskSignalDto['severity'] }) {
  if (severity === 'high') return <Badge tone="down">High</Badge>;
  if (severity === 'medium') return <Badge tone="warn">Medium</Badge>;
  return <Badge tone="neutral">Low</Badge>;
}
