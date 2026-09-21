'use client';

import { useActionState, useState } from 'react';
import { Check, Copy, Pencil, Unplug, X } from 'lucide-react';

import { MAX_LABEL_LENGTH } from '@/modules/wallet-link';
import { Button } from '@/shared/ui/primitives/button';

import { renameWalletAction, revokeWalletAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_ROW } from '../_lib/wallet-form-state';

/**
 * The per-row controls: copy, rename, disconnect.
 *
 * ── A leaf, so the table stays on the server ──────────────────────────────────
 * The wallets table is a Server Component; only these three controls hydrate.
 * Marking the table `'use client'` to get a copy button would ship every row as
 * JSON and then ship the code to render it again — the island-extraction pattern
 * `docs/architecture.md` §5 describes, applied to the smallest thing that needs it.
 *
 * ── Disconnect confirms in place, rather than with a dialog ───────────────────
 * Two clicks, the second one labelled with what it does. A modal for an action
 * that is this reversible would be ceremony — the link can be made again by
 * signing again, and nothing about the customer's balances depends on it.
 */
export function WalletRowActions({
  id,
  address,
  label,
}: {
  id: string;
  address: string;
  label: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const [renameState, rename, renaming] = useActionState(renameWalletAction, IDLE_WALLET_ROW);
  const [revokeState, revoke, revoking] = useActionState(revokeWalletAction, IDLE_WALLET_ROW);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A denied clipboard permission is not worth an error state — the full
         address is rendered next to this button and can be selected by hand. */
    }
  };

  if (editing) {
    return (
      <form
        action={(data) => {
          rename(data);
          setEditing(false);
        }}
        className="flex items-center justify-end gap-1.5"
      >
        <input type="hidden" name="id" value={id} />
        <input
          name="label"
          defaultValue={label ?? ''}
          maxLength={MAX_LABEL_LENGTH}
          autoFocus
          placeholder="Label"
          className="w-36 rounded-md border border-line bg-bg-elev/60 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand-soft"
        />
        <Button type="submit" variant="ghost" size="sm" disabled={renaming} aria-label="Save label">
          <Check className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy address">
        {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
      </Button>

      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Rename">
        <Pencil className="size-3.5" />
      </Button>

      {confirming ? (
        <form action={revoke} className="flex items-center gap-1">
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="ghost" size="sm" disabled={revoking} className="text-down">
            {revoking ? 'Disconnecting…' : 'Confirm'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          aria-label="Disconnect"
        >
          <Unplug className="size-3.5" />
        </Button>
      )}

      {/* One row's failure, reported on that row. `useActionState` keeps its last
          reply, and the id it carries is what stops a stale error appearing
          beside a different wallet. */}
      {renameState.id === id && renameState.status === 'error' ? (
        <span className="text-2xs text-down" role="alert">
          {renameState.message}
        </span>
      ) : null}
      {revokeState.id === id && revokeState.status === 'error' ? (
        <span className="text-2xs text-down" role="alert">
          {revokeState.message}
        </span>
      ) : null}
    </div>
  );
}
