'use client';

import { useActionState, useState } from 'react';
import { BadgeCheck, Ban, Hourglass, TriangleAlert } from 'lucide-react';

import type { DepositClaimView } from '@/server/ledger';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';

import { decideDepositAction } from '../_lib/deposit-actions';
import { IDLE_DECISION_STATE } from '../_lib/form-state';

/**
 * Confirm or refuse one deposit claim.
 *
 * ── The credited amount defaults to the claim but is editable ──────────────────
 * Because the two genuinely differ: people mistype, networks take fees, partial
 * sends happen. An operator credits what they actually saw on chain, and the claim
 * is kept beside it — the gap between the two is what a dispute is about, and a
 * field that silently overwrote the claim would destroy the evidence.
 *
 * ── Three buttons, and only two of them decide ─────────────────────────────────
 * "Mark pending" is not an outcome. It says the evidence has been seen and the
 * wait is now on blocks rather than on an operator — a real and often long state
 * that the customer previously could not distinguish from nobody having looked. It
 * credits nothing, and the claim stays in this queue to be approved or rejected
 * afterwards.
 *
 * The word matches what the customer is shown. Their screens have three states —
 * Pending, Completed, Failed, the three every account anybody has ever held uses —
 * and this is the button that puts a claim in the first one. The console keeps the
 * finer reading in the line beneath, because the distinction between "nobody has
 * looked" and "the chain is slow" is the operator's to act on, not the customer's.
 *
 * It is shown only while the claim is still `pending`. Once marked, pressing it
 * again would overwrite the timestamp that records how long the wait has been
 * running, which is the one figure the state exists to carry — so the button goes
 * and the panel says when it was marked instead.
 *
 * ── One text box, two meanings, and the labels carry the difference ────────────
 * A rejection needs a reason and this state takes an optional note; both are shown
 * to the customer, so they share a field rather than stacking two textareas an
 * operator has to choose between. They are stored separately — `reason` means "why
 * this was refused" everywhere it is rendered, and a progress note in it would
 * have the wallet explain a rejection that never happened.
 */
export function DepositDecision({ claim }: { claim: DepositClaimView }) {
  const [state, submit, pending] = useActionState(decideDepositAction, IDLE_DECISION_STATE);
  const [credited, setCredited] = useState(claim.claimedAmount);
  const [reason, setReason] = useState('');

  const mine = state.withdrawalId === claim.id;
  const differs = credited.trim() !== claim.claimedAmount;

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="claimId" value={claim.id} />

      <label className="block">
        <span className="mb-1.5 block text-2xs uppercase tracking-[0.12em] text-fg-subtle">
          Amount to credit
        </span>
        <input
          name="creditedAmount"
          value={credited}
          onChange={(event) => setCredited(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          className="h-10 w-full rounded-md border border-line bg-surface px-3 font-mono text-xs text-fg focus:border-line-strong focus:outline-none"
        />
        {differs ? (
          <span className="mt-1 block text-2xs text-warn">
            Differs from the {claim.claimedAmount} {claim.asset} claimed. Both are kept.
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="sr-only">Reason, required to reject</span>
        <textarea
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          placeholder={
            claim.status === 'pending'
              ? 'Reason to reject, or what the customer is waiting for — both are shown to them'
              : 'Reason — required to reject, shown to the customer'
          }
          className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
        />
      </label>

      {claim.status === 'confirming' ? (
        <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-2xs leading-relaxed text-fg-muted">
          <Hourglass className="mt-0.5 size-3 shrink-0 text-warn" />
          <span>
            Pending on chain since
            {claim.confirmingAt === null ? ' it was marked' : ` ${formatDate(claim.confirmingAt)}`}.
            {claim.confirmingNote === null ? '' : ` “${claim.confirmingNote}”`} The
            customer sees this as <strong className="font-medium text-fg">Pending</strong>,
            with that note under it. Nothing is credited until you approve it.
          </span>
        </p>
      ) : null}

      {mine && state.message ? (
        <p
          role="status"
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-2xs leading-relaxed',
            state.status === 'error'
              ? 'border-down/35 bg-down/8 text-fg'
              : 'border-up/35 bg-up/8 text-fg',
          )}
        >
          {state.status === 'error' ? (
            <TriangleAlert className="mt-0.5 size-3 shrink-0 text-down" />
          ) : (
            <BadgeCheck className="mt-0.5 size-3 shrink-0 text-up" />
          )}
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-medium text-up transition-colors hover:border-up/70 hover:bg-up/18 disabled:pointer-events-none disabled:opacity-40"
        >
          <BadgeCheck className="size-3.5" />
          {pending ? 'Working…' : 'Confirm & credit'}
        </button>

        {claim.status === 'pending' ? (
          <button
            type="submit"
            name="decision"
            value="confirming"
            disabled={pending}
            title="Tells the customer it is pending on the network. Credits nothing, and it stays in this queue."
            className="inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn transition-colors hover:border-warn/70 hover:bg-warn/18 disabled:pointer-events-none disabled:opacity-40"
          >
            <Hourglass className="size-3.5" />
            Mark pending
          </button>
        ) : null}

        <button
          type="submit"
          name="decision"
          value="reject"
          // Disabled without a reason rather than failing on submit: the rule is
          // knowable before the click.
          disabled={pending || reason.trim().length === 0}
          title={reason.trim().length === 0 ? 'A rejection needs a reason' : undefined}
          className="inline-flex items-center gap-1.5 rounded-md border border-down/40 bg-down/10 px-3 py-1.5 text-xs font-medium text-down transition-colors hover:border-down/70 hover:bg-down/18 disabled:pointer-events-none disabled:opacity-40"
        >
          <Ban className="size-3.5" />
          Reject
        </button>
      </div>
    </form>
  );
}
