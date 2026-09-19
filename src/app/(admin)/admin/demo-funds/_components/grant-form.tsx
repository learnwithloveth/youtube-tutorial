'use client';

import { useActionState, useState } from 'react';
import { Check, Coins, Loader2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { grantDemoFundsAction } from '../_lib/actions';
import { IDLE_GRANT } from '../_lib/form-state';

/**
 * One account's funding form.
 *
 * ── Its own action state, one per row ─────────────────────────────────────────
 * The announcements board threads an id through its form state so a message can
 * be matched back to the card it belongs to. That is the right shape there, where
 * several cards share one `useActionState`. Here every row mounts its own hook,
 * so the state already belongs to exactly one account and an id would be a field
 * that could only ever disagree with itself.
 *
 * ── The amount is a text input, not `type="number"` ───────────────────────────
 * A number input hands back a value the browser has already parsed and
 * re-serialised, which for eight- and eighteen-decimal assets is precisely the
 * float round trip this codebase forbids. `inputMode="decimal"` gets the numeric
 * keypad on a phone without letting the browser near the value; the string
 * travels to `Money.fromDecimalString` exactly as it was typed.
 */
export function GrantForm({
  userId,
  assets,
  compact,
}: {
  userId: string;
  assets: readonly { code: string; name: string; scale: number }[];
  /** Laid out as a row inside a table cell rather than as a stacked panel form. */
  compact?: boolean;
}) {
  const [state, submit, pending] = useActionState(grantDemoFundsAction, IDLE_GRANT);
  const [asset, setAsset] = useState(assets[0]?.code ?? '');

  return (
    <form action={submit} className={cn('grid gap-2', compact ? 'sm:grid-cols-[auto_1fr_auto]' : 'gap-3')}>
      <input type="hidden" name="userId" value={userId} />

      <label className="sr-only" htmlFor={`asset-${userId}`}>
        Asset
      </label>
      <select
        id={`asset-${userId}`}
        name="asset"
        value={asset}
        onChange={(event) => setAsset(event.target.value)}
        className="rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-xs text-fg outline-none transition-colors focus:border-brand-soft"
      >
        {assets.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`amount-${userId}`}>
        Amount
      </label>
      <input
        id={`amount-${userId}`}
        name="amount"
        required
        inputMode="decimal"
        autoComplete="off"
        placeholder="Amount"
        className="min-w-0 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 font-mono text-xs text-fg outline-none transition-colors placeholder:font-sans placeholder:text-fg-subtle focus:border-brand-soft"
      />

      {/* Optional, and the use case says why: there is nothing outside this system
          for a demo grant to be checked against, so a required reference would be
          asking an operator to invent a fact. */}
      {!compact ? (
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">
            Note <span className="text-fg-subtle">(optional)</span>
          </span>
          <input
            name="note"
            maxLength={120}
            autoComplete="off"
            placeholder="Tuesday workshop, group B"
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft"
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state.status === 'granted' ? (
          <Check className="size-3.5" />
        ) : (
          <Coins className="size-3.5" />
        )}
        {compact ? 'Fund' : 'Add demo funds'}
      </button>

      {state.message !== null ? (
        <p
          role="status"
          className={cn(
            'text-2xs leading-relaxed',
            compact && 'sm:col-span-3',
            state.status === 'error' ? 'text-down' : 'text-up',
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
