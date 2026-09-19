'use client';

import { useActionState, useState } from 'react';
import { Check, Coins, Loader2, Mail, MailX } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { grantDemoFundsAction } from '../_lib/actions';
import { IDLE_GRANT } from '../_lib/form-state';

export interface FundableAsset {
  readonly code: string;
  readonly name: string;
  readonly scale: number;
  readonly networks: readonly { readonly id: string; readonly label: string }[];
}

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
 *
 * ── The network selector appears only when there is a question ────────────────
 * USDT is the case that prompted it — Tron and Ethereum differ in address format,
 * in fee, and in the coin that pays for the eventual withdrawal, so "USDT" alone
 * does not say what a student is being shown. Bitcoin turns out to have the same
 * shape, since Lightning is a second route with its own invoice format, so the
 * rule is the general one: ask whenever the catalogue lists more than one chain.
 *
 * Ether and TRX list one each, and there the dropdown is absent rather than
 * showing a single option — a control that decides nothing is the thing this
 * console removed two whole tabs for. The server defaults to that one network,
 * and the hidden field sends it so the two cannot drift.
 *
 * What none of this does is imply a separate balance. There is one USDT account
 * per customer whichever chain the tokens came in on, exactly as on a real
 * exchange; the network describes the route in. The note under the table says so.
 */
export function GrantForm({
  userId,
  assets,
  mailConfigured,
  compact,
}: {
  userId: string;
  assets: readonly FundableAsset[];
  /** False when no SMTP is configured, in which case a send would go nowhere. */
  mailConfigured: boolean;
  /** Laid out as a wrapping row inside a table cell rather than a stacked form. */
  compact?: boolean;
}) {
  const [state, submit, pending] = useActionState(grantDemoFundsAction, IDLE_GRANT);
  const [assetCode, setAssetCode] = useState(assets[0]?.code ?? '');

  const asset = assets.find((option) => option.code === assetCode) ?? assets[0];
  const networks = asset?.networks ?? [];
  // One network is not a choice, so it is not offered — the server defaults to it.
  const choosable = networks.length > 1;

  const field =
    'rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-xs text-fg outline-none transition-colors focus:border-brand-soft';

  return (
    <form
      action={submit}
      className={cn(compact ? 'flex flex-wrap items-center gap-2' : 'grid gap-3')}
    >
      <input type="hidden" name="userId" value={userId} />

      <label className="sr-only" htmlFor={`asset-${userId}`}>
        Asset
      </label>
      <select
        id={`asset-${userId}`}
        name="asset"
        value={assetCode}
        onChange={(event) => setAssetCode(event.target.value)}
        className={field}
      >
        {assets.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code}
          </option>
        ))}
      </select>

      {choosable ? (
        <>
          <label className="sr-only" htmlFor={`network-${userId}`}>
            Network
          </label>
          <select
            id={`network-${userId}`}
            name="network"
            required
            className={field}
            defaultValue=""
          >
            {/* No preselection. An asset on two chains has no obvious default, and
                one chosen for the operator is one they never consciously picked.
                `required` saves a round trip; the server refuses an empty network
                regardless, because a form is not an authority. */}
            <option value="" disabled>
              Network…
            </option>
            {networks.map((network) => (
              <option key={network.id} value={network.id}>
                {network.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        // Submitted so the server sees the same value the operator was shown,
        // rather than relying on a default the two might one day disagree about.
        <input type="hidden" name="network" value={networks[0]?.id ?? ''} />
      )}

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
        className={cn(
          field,
          'min-w-0 font-mono placeholder:font-sans placeholder:text-fg-subtle',
          compact ? 'w-24 flex-1' : '',
        )}
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

      <EmailToggle userId={userId} configured={mailConfigured} />

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
            'w-full text-2xs leading-relaxed',
            state.status === 'error' ? 'text-down' : 'text-up',
          )}
        >
          {state.message}
          {/* Said separately from the grant, because it is a separate outcome: the
              funds are on the account whether or not the message went. */}
          {state.emailed === true ? (
            <span className="ml-1 text-fg-subtle">They have been emailed.</span>
          ) : null}
          {state.emailed === false ? (
            <span className="ml-1 text-warn">
              The email did not go: {state.emailProblem ?? 'the mail server refused it.'}
            </span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Whether to tell the student.
 *
 * ── On by default, and that is the deliberate choice ──────────────────────────
 * The safer default for anything outward-facing is normally off. Here the point
 * of the screen is a tutor funding a room full of accounts at the start of a
 * session, and a default of off means twenty people are funded and none of them
 * find out. Unticking is one click and the box is in the row, not behind a menu.
 *
 * ── It is disabled outright when nothing could send ───────────────────────────
 * With no SMTP configured the platform's mail transport logs the message and
 * reports success, which would have this form cheerfully announce an email that
 * went nowhere. Better to say so in the tooltip and take the option away.
 */
function EmailToggle({ userId, configured }: { userId: string; configured: boolean }) {
  return (
    <label
      htmlFor={`notify-${userId}`}
      title={
        configured
          ? 'Email them that demo funds were added'
          : 'No mail server is configured on this deployment, so nothing can be sent.'
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-2xs transition-colors',
        configured
          ? 'cursor-pointer text-fg-muted hover:border-brand-soft/60 hover:text-fg'
          : 'cursor-not-allowed text-fg-subtle opacity-60',
      )}
    >
      <input
        id={`notify-${userId}`}
        name="notify"
        type="checkbox"
        defaultChecked={configured}
        disabled={!configured}
        className="size-3.5 accent-brand"
      />
      {configured ? <Mail className="size-3.5" /> : <MailX className="size-3.5" />}
      Email
    </label>
  );
}
