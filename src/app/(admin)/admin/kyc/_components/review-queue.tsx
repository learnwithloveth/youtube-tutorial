'use client';

import { useActionState, useState } from 'react';
import { Check, X } from 'lucide-react';

import type { VerificationSummaryDto } from '@/modules/identity';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { decideVerificationAction } from '../_lib/actions';
import { IDLE_ADJUDICATION } from '../_lib/form-state';

/**
 * The queue and the case beside it.
 *
 * ── Why this leaf is a Client Component and the page is not ───────────────────
 * Selecting a case is local state, and the decision form needs `useActionState`
 * for its pending flag. Everything above it — the read, the authorisation, the
 * tiles — stays on the server, so the queue arrives as data rather than as a fetch
 * the browser makes after paint.
 */

const DOCUMENT_LABELS: Record<VerificationSummaryDto['documentType'], string> = {
  passport: 'Passport',
  'national-id': 'National ID',
  'drivers-licence': "Driver's licence",
};

export function ReviewQueue({
  pending,
  decided,
  accounts,
}: {
  pending: readonly VerificationSummaryDto[];
  decided: readonly VerificationSummaryDto[];
  accounts: Readonly<Record<string, string>>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const all = [...pending, ...decided];
  const selected = all.find((entry) => entry.id === selectedId) ?? pending[0] ?? all[0] ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Panel padded={false} className="min-w-0 overflow-hidden">
        <div className="px-5 pt-5">
          <PanelHeader
            title="Queue"
            subtitle={`${pending.length} awaiting a decision`}
          />
        </div>

        <ul className="divide-y divide-line/60">
          {all.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setSelectedId(entry.id)}
                aria-current={selected?.id === entry.id ? 'true' : undefined}
                className={cn(
                  'w-full px-5 py-3 text-left transition-colors',
                  selected?.id === entry.id ? 'bg-surface-hover' : 'hover:bg-surface',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                    {entry.fullName}
                  </span>
                  <StatusBadge status={entry.status} />
                </span>
                <span className="mt-1 block truncate text-2xs text-fg-subtle">
                  {DOCUMENT_LABELS[entry.documentType]} · {entry.country} ·{' '}
                  {formatDate(entry.submittedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {selected === null ? null : (
        <CaseDetail
          key={selected.id}
          verification={selected}
          email={accounts[selected.userId] ?? null}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: VerificationSummaryDto['status'] }) {
  if (status === 'approved') return <Badge tone="up">Verified</Badge>;
  if (status === 'rejected') return <Badge tone="down">Refused</Badge>;
  return <Badge tone="accent">Waiting</Badge>;
}

function CaseDetail({
  verification,
  email,
}: {
  verification: VerificationSummaryDto;
  email: string | null;
}) {
  const [state, submit, pending] = useActionState(decideVerificationAction, IDLE_ADJUDICATION);
  const [reason, setReason] = useState('');

  const decided = verification.status !== 'pending';
  const message = state.verificationId === verification.id ? state.message : null;

  return (
    <div className="grid min-w-0 gap-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-semibold text-fg">{verification.fullName}</p>
            <p className="mt-0.5 truncate text-xs text-fg-subtle">
              {/* The id when the directory could not answer: an operator can act on
                  an id, and a queue that shows "Unknown" hides which account. */}
              {email ?? verification.userId} · submitted {formatDate(verification.submittedAt)}
            </p>
          </div>
          <StatusBadge status={verification.status} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Document" subtitle={DOCUMENT_LABELS[verification.documentType]} />
          {/* Served by a route that checks the session itself and answers `no-store`.
              A photograph of a passport must never reach a shared cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/verifications/${verification.id}/document`}
            alt={`Identity document submitted by ${verification.fullName}`}
            className="mt-3 w-full rounded-lg border border-line bg-bg-sunken object-contain"
          />
          <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
            Uploaded by the customer. The file type is decided from its bytes, never
            from what the browser declared.
          </p>
        </Panel>

        <Panel>
          <PanelHeader title="What was submitted" subtitle="Typed by the customer" />
          <dl className="mt-3 divide-y divide-line/60">
            <Field label="Name on document" value={verification.fullName} />
            <Field label="Date of birth" value={verification.dateOfBirth} mono />
            <Field label="Issuing country" value={verification.country} mono />
            <Field label="Document type" value={DOCUMENT_LABELS[verification.documentType]} />
            <Field label="Document number" value={verification.documentNumber} mono />
            <Field label="Account" value={email ?? verification.userId} />
          </dl>

          <p className="mt-4 rounded-md border border-line bg-bg-sunken px-3 py-2 text-2xs leading-relaxed text-fg-muted">
            {/* Said on the screen, not just in a comment. An operator deciding this
                case needs to know nothing was checked before it reached them. */}
            No automated checks have run on this submission. This platform has no
            document-authenticity vendor, no face match, no liveness capture and no
            sanctions or PEP screening. Compare the typed fields against the image
            yourself.
          </p>
        </Panel>
      </div>

      <Panel>
        {decided ? (
          <>
            <PanelHeader
              title="Decided"
              subtitle={
                verification.decidedAt === null
                  ? undefined
                  : `on ${formatDate(verification.decidedAt)}`
              }
            />
            {verification.reason === null ? null : (
              <p className="mt-3 rounded-md border border-line bg-bg-sunken px-3 py-2 text-xs leading-relaxed text-fg-muted">
                {verification.reason}
              </p>
            )}
            <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
              A decision is made once. A customer who was refused submits again, and
              that arrives as a new case rather than reopening this one.
            </p>
          </>
        ) : (
          <form action={submit} className="grid gap-3">
            <input type="hidden" name="verificationId" value={verification.id} />

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-fg-muted">
                Reason — required to refuse, and shown to the customer
              </span>
              <textarea
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="What the customer must change before resubmitting."
                className="resize-y rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft"
              />
            </label>

            {/* Plain submit buttons rather than the console's `ConfirmButton`,
                matching the approvals form: those primitives are `type="button"`
                with an `onClick`, and a Server Action needs the button's own
                `name`/`value` in the submitted FormData to carry the decision. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                name="decision"
                value="approve"
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-medium text-up transition-colors hover:border-up/70 hover:bg-up/18 disabled:pointer-events-none disabled:opacity-40"
              >
                <Check className="size-3.5" />
                {pending ? 'Working…' : 'Approve and verify'}
              </button>

              <button
                type="submit"
                name="decision"
                value="reject"
                // Disabled without a reason rather than failing on submit: the rule
                // is knowable before the click, and finding out afterwards wastes
                // the operator's turn as well as the customer's.
                disabled={pending || reason.trim().length === 0}
                title={reason.trim().length === 0 ? 'A rejection needs a reason' : undefined}
                className="inline-flex items-center gap-1.5 rounded-md border border-down/40 bg-down/10 px-3 py-1.5 text-xs font-medium text-down transition-colors hover:border-down/70 hover:bg-down/18 disabled:pointer-events-none disabled:opacity-40"
              >
                <X className="size-3.5" />
                Reject
              </button>
            </div>

            {message === null ? null : (
              <p
                className={cn(
                  'text-xs',
                  state.status === 'error' ? 'text-down' : 'text-up',
                )}
              >
                {message}
              </p>
            )}
          </form>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-fg-subtle">{label}</dt>
      <dd
        {...(mono ? { 'data-numeric': '' } : {})}
        className={cn('min-w-0 break-all text-right text-fg', mono ? 'text-xs' : 'text-sm')}
      >
        {value}
      </dd>
    </div>
  );
}
