'use client';

import { useActionState, useRef, useState } from 'react';
import { ImageUp } from 'lucide-react';

import { Button } from '@/shared/ui/primitives/button';

import { attachEvidenceAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_ROW } from '../_lib/wallet-form-state';
import { TextAreaField } from '@/shared/ui/primitives/field';

export function EvidenceControl({
  walletId,
  evidenceId,
  messageLabel,
  messageHint,
}: {
  walletId: string;
  evidenceId: string | null;
  messageLabel: string;
  messageHint: string;
}) {
  const [state, attach, attaching] = useActionState(attachEvidenceAction, IDLE_WALLET_ROW);
  const formRef = useRef<HTMLFormElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={attach}
      className="flex flex-col  gap-2"
    >
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

      {state.message ? (
        <p
          className={state.status === 'error' ? 'text-xs text-down' : 'text-xs text-up'}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <input type="hidden" name="id" value={walletId} />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-2xs font-semibold text-fg-muted transition-colors duration-200 hover:border-line-strong hover:text-fg">
          <ImageUp className="size-3.5" />
          {chosen ?? 'Attach a screenshot'}
          <input
            type="file"
            name="evidence"
            // PNG/JPEG/WebP only, which the server re-decides from the bytes.
            // This attribute is a file-picker convenience, never a control.
            accept="image/png,image/jpeg,image/webp"
            className={'sr-only' + evidenceId ? ' hidden' : ''}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setChosen(file ? file.name : null);
              if (file) formRef.current?.requestSubmit();
            }}
          />
        </label>
        <Button type="submit" variant="ghost" disabled={attaching}>
          {attaching ? 'Attaching…' : 'Submit'}
        </Button>
      </div>
    </form>
  );
}
