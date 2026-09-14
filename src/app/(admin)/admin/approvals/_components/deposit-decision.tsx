'use client';

import { useActionState, useState } from 'react';
import { BadgeCheck, Ban, TriangleAlert } from 'lucide-react';

import type { DepositClaimView } from '@/server/ledger';
import { cn } from '@/shared/lib/cn';

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
          placeholder="Reason — required to reject, shown to the customer"
          className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
        />
      </label>

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
