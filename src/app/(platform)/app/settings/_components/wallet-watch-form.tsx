'use client';

// import { useActionState } from 'react';
// import { Eye } from 'lucide-react';

// import { Button } from '@/shared/ui/primitives/button';
// import { TextAreaField } from '@/shared/ui/primitives/field';

// import { watchAddressAction } from '../_lib/wallet-actions';
// import { IDLE_WALLET_FORM } from '../_lib/wallet-form-state';
import { EvidenceControl } from './wallet-evidence-control';

export function WatchAddressForm({
  messageHint,
  messageLabel,
}: {
  messageLabel: string;
  messageHint: string;
}) {
  // const [state, submit, pending] = useActionState(watchAddressAction, IDLE_WALLET_FORM);

  return (
    <EvidenceControl
      walletId=""
      evidenceId={null}
      messageLabel={messageLabel ?? ''}
      messageHint={messageHint ?? ''}
    />
  );

  // return (
  //   <form
  //     action={(formData) => {
  //       console.log('Form submission: ', Array.from(formData.values()));
  //     }}
  //     className="space-y-4"
  //   >
  //     <TextAreaField
  //       label={messageLabel ?? 'Wallet address'}
  //       name="address"
  //       required
  //       autoComplete="off"
  //       spellCheck={false}
  //       placeholder={messageHint ?? '0x…'}
  //       hint="42 characters, starting with 0x. Found in your wallet under “Receive”."
  //       className="font-mono"
  //     ></TextAreaField>

  //     <EvidenceControl
  //       walletId=""
  //       evidenceId={null}
  //       messageLabel={messageLabel ?? ''}
  //       messageHint={messageHint ?? ''}
  //     />

  //     {state.message ? (
  //       <p
  //         className={state.status === 'error' ? 'text-xs text-down' : 'text-xs text-up'}
  //         role={state.status === 'error' ? 'alert' : 'status'}
  //       >
  //         {state.message}
  //       </p>
  //     ) : null}

  //     <Button type="submit" variant="outline" size="sm" disabled={pending}>
  //       <Eye className="size-3.5" />
  //       {pending ? 'Adding…' : 'Submit'}
  //     </Button>
  //   </form>
  // );
}
