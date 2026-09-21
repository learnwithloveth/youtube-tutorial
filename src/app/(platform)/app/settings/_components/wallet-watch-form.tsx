'use client';

import { JSX, useActionState } from 'react';
import { Eye, ShieldAlert } from 'lucide-react';

import { Button } from '@/shared/ui/primitives/button';
import { SelectField, TextAreaField, TextField } from '@/shared/ui/primitives/field';

import { watchAddressAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_FORM } from '../_lib/wallet-form-state';
import { EvidenceControl } from './wallet-evidence-control';

/**
 * Adding an address by hand.
 *
 * ── This is the manual path, and it takes one public value ────────────────────
 * An address. Nothing else. It is worth saying plainly on the screen as well as in
 * the code, because "connect manually" is the exact phrase used by the pages that
 * exist to harvest recovery phrases: a site that can read your phrase can empty
 * every account it unlocks, instantly and irreversibly, and no amount of
 * reassuring copy around the field changes that.
 *
 * So there is no phrase field here, there is no parameter for one on the action
 * behind it, and there is no column for one in the table beneath that. The warning
 * below is rendered for everyone rather than hidden behind a disclosure, because
 * the person who needs to read it is the one who would not have opened it.
 *
 * ── What it produces ──────────────────────────────────────────────────────────
 * A watch-only row. Marked as such on the list, forever, unless a signature from
 * that address arrives later and upgrades it in place.
 */
export function WatchAddressForm({
  messageHint,
  messageLabel,
}: {
  messageLabel: string;
  messageHint: string;
}) {
  const [state, submit, pending] = useActionState(watchAddressAction, IDLE_WALLET_FORM);

  return (
    <form action={submit} className="space-y-4">
      <TextAreaField
        label={messageLabel ?? 'Wallet address'}
        name="address"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder={messageHint ?? '0x…'}
        hint="42 characters, starting with 0x. Found in your wallet under “Receive”."
        className="font-mono"
      ></TextAreaField>

      <EvidenceControl walletId="" evidenceId={null} />

      {state.message ? (
        <p
          className={state.status === 'error' ? 'text-xs text-down' : 'text-xs text-up'}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Eye className="size-3.5" />
        {pending ? 'Adding…' : 'Watch this address'}
      </Button>
    </form>
  );
}
