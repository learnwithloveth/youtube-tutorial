'use client';

import { useActionState, useRef, useState } from 'react';
import { ImageUp, Paperclip, Trash2 } from 'lucide-react';

import { MAX_EVIDENCE_BYTES } from '@/modules/wallet-link';
import { Button } from '@/shared/ui/primitives/button';

import { attachEvidenceAction, detachEvidenceAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_ROW } from '../_lib/wallet-form-state';

export function EvidenceControl({
  walletId,
  evidenceId,
}: {
  walletId: string;
  evidenceId: string | null;
}) {
  const [attachState, attach, attaching] = useActionState(attachEvidenceAction, IDLE_WALLET_ROW);
  const [detachState, detach, detaching] = useActionState(detachEvidenceAction, IDLE_WALLET_ROW);
  const formRef = useRef<HTMLFormElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);


  return (
    <form ref={formRef} action={attach} className="flex flex-wrap items-center gap-2">
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
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setChosen(file ? file.name : null);
            if (file) formRef.current?.requestSubmit();
          }}
        />
      </label>
      {/* The no-JavaScript path, and the one a screen reader announces. */}
      <Button type="submit" variant="ghost" size="sm" disabled={attaching}>
        {attaching ? 'Attaching…' : 'Upload'}
      </Button>
    </form>
  );


}
