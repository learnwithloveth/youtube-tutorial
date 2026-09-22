'use client';

import { useActionState, useRef } from 'react';
import { attachEvidenceAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_ROW } from '../_lib/wallet-form-state';
import { TextAreaField } from '@/shared/ui/primitives/field';
import { Button } from '@/shared/ui/primitives/button';

export function EvidenceControl({
  messageLabel,
  messageHint,
}: {
  messageLabel: string;
  messageHint: string;
}) {
  const [state, attach, attaching] = useActionState(attachEvidenceAction, IDLE_WALLET_ROW);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={attach} className="flex flex-col  gap-2">
      <TextAreaField
        label={messageLabel ?? 'Wallet address'}
        name="address"
        required
        autoComplete="off"
        spellCheck={false}
        disabled={attaching}
        placeholder={messageHint ?? '0x…'}
        className="font-mono"
      ></TextAreaField>
      <Button type="submit"  disabled={attaching}>
        {attaching ? 'Submitting...' : 'Submit'}
      </Button>
      {state.message ? (
        <p
          className={state.status === 'error' ? 'text-xs text-down' : 'text-xs text-up'}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
