'use client';

import { useActionState } from 'react';
import { Eye, ShieldAlert } from 'lucide-react';

import { CHAINS, MAX_LABEL_LENGTH } from '@/modules/wallet-link';
import { Button } from '@/shared/ui/primitives/button';
import { SelectField, TextField } from '@/shared/ui/primitives/field';

import { watchAddressAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_FORM } from '../_lib/wallet-form-state';

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
export function WatchAddressForm() {
  const [state, submit, pending] = useActionState(watchAddressAction, IDLE_WALLET_FORM);

  return (
    <form action={submit} className="space-y-4">
      <p className="text-sm leading-relaxed text-fg-muted">
        Add an address to keep an eye on &mdash; a hardware wallet in a safe, or a cold
        wallet you would rather not connect. Nothing is proved by this, so it stays
        marked <span className="text-fg">Watch only</span> until a signature from that
        address says otherwise.
      </p>

      <div className="flex items-start gap-2.5 rounded-md border border-[color-mix(in_oklab,var(--warn)_32%,transparent)] bg-bg-elev/40 px-4 py-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        <p className="text-xs leading-relaxed text-fg-muted">
          <span className="font-medium text-fg">Only ever paste a public address here.</span>{' '}
          Novex will never ask for your recovery phrase, seed words or private key &mdash;
          not on this page, not by email, and not in chat. Any site that does is stealing
          from you, including one that looks exactly like this one.
        </p>
      </div>

      <TextField
        label="Wallet address"
        name="address"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="0x…"
        hint="42 characters, starting with 0x. Found in your wallet under “Receive”."
        className="font-mono"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Network"
          name="chainId"
          defaultValue="1"
          options={CHAINS.map((chain) => ({ value: String(chain.id), label: chain.name }))}
        />

        <TextField
          label="Label"
          name="label"
          maxLength={MAX_LABEL_LENGTH}
          autoComplete="off"
          placeholder="Cold storage"
          hint="Optional. Only you see it."
        />
      </div>

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
