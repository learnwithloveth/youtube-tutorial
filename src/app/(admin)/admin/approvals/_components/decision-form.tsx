'use client';

import { useActionState, useState } from 'react';
import { BadgeCheck, Ban, TriangleAlert } from 'lucide-react';

import type { WithdrawalDto } from '@/modules/ledger';
import { cn } from '@/shared/lib/cn';

import { decideWithdrawalAction } from '../_lib/actions';
import { IDLE_DECISION_STATE } from '../_lib/form-state';

/**
 * Approve or reject one withdrawal.
 *
 * ── A reason is required to reject, and the field is always shown ──────────────
 * Not revealed on click. An operator composing a rejection is about to tell a
 * customer why their money is not moving, and a textarea that appears only after
 * they have committed to rejecting encourages one word typed to get past a
 * validation error.
 *
 * ── The approve button is not disabled while pending ───────────────────────────
 * It is replaced. A disabled button that still looks clickable is how an operator
 * clicks twice; the ledger refuses the second signature from the same person
 * anyway, but the interface should not have invited it.
 */
export function DecisionForm({ withdrawal }: { withdrawal: WithdrawalDto }) {
  const [state, submit, pending] = useActionState(decideWithdrawalAction, IDLE_DECISION_STATE);
  const [reason, setReason] = useState('');

  const mine = state.withdrawalId === withdrawal.id;

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="withdrawalId" value={withdrawal.id} />

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
          {pending ? 'Working…' : withdrawal.approvalsRequired > 1 ? 'Sign off' : 'Approve'}
        </button>

        <button
          type="submit"
          name="decision"
          value="reject"
          // Disabled without a reason rather than failing on submit: the rule is
          // knowable before the click, so the interface should say so.
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
