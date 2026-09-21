'use client';

import { useActionState, useRef, useState } from 'react';
import { ImageUp, Paperclip, Trash2 } from 'lucide-react';

import { MAX_EVIDENCE_BYTES } from '@/modules/wallet-link';
import { Button } from '@/shared/ui/primitives/button';

import { attachEvidenceAction, detachEvidenceAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_ROW } from '../_lib/wallet-form-state';

/**
 * Attaching a screenshot to a watch-only wallet.
 *
 * ── A leaf, and only on the rows that accept one ──────────────────────────────
 * Rendered by the server only where `acceptsEvidence` is true — a verified wallet
 * has a signature and is not offered this. The table around it stays a Server
 * Component.
 *
 * ── The submit is automatic, and that is deliberate ───────────────────────────
 * Choosing a file submits it. A separate "upload" button after a file picker is a
 * step people forget, and the failure mode is somebody believing they attached
 * something they did not — on a screen whose whole purpose is telling support what
 * they have. The form still works without JavaScript, because it is a real `form`
 * with a real `action`: the button below is what a non-hydrated page uses.
 *
 * ── It says what it is not ────────────────────────────────────────────────────
 * The hint under the control states that this does not verify anything. That
 * sentence is load-bearing: "upload a photo to verify your wallet" is a phishing
 * pattern, and a customer who believes a screenshot verifies a wallet will send
 * one instead of signing — and will believe an attacker who asks for more.
 */
export function EvidenceControl({
  walletId,
  evidenceId,
}: {
  walletId: string;
  evidenceId: string | null;
}) {
  const [attachState, attach, attaching] = useActionState(
    attachEvidenceAction,
    IDLE_WALLET_ROW,
  );
  const [detachState, detach, detaching] = useActionState(
    detachEvidenceAction,
    IDLE_WALLET_ROW,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const message =
    attachState.id === walletId
      ? attachState
      : detachState.id === walletId
        ? detachState
        : null;

  return (
    <div className="mt-2 space-y-1.5">
      {evidenceId === null ? (
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
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/wallet-link/evidence/${encodeURIComponent(evidenceId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-2xs font-semibold text-brand-soft transition-colors duration-200 hover:text-fg"
          >
            <Paperclip className="size-3.5" />
            View attachment
          </a>
          <form action={detach}>
            <input type="hidden" name="id" value={walletId} />
            <Button type="submit" variant="ghost" size="sm" disabled={detaching} aria-label="Remove attachment">
              <Trash2 className="size-3.5" />
            </Button>
          </form>
        </div>
      )}

      <p className="text-2xs leading-relaxed text-fg-subtle">
        A screenshot of your wallet showing this address. PNG, JPEG or WebP, up to{' '}
        {Math.round(MAX_EVIDENCE_BYTES / 1024)}KB.{' '}
        <span className="text-fg-muted">
          It does not verify the wallet — only a signature does. Never upload a picture
          of a recovery phrase.
        </span>
      </p>

      {message?.message ? (
        <p
          className={message.status === 'error' ? 'text-2xs text-down' : 'text-2xs text-up'}
          role={message.status === 'error' ? 'alert' : 'status'}
        >
          {message.message}
        </p>
      ) : null}
    </div>
  );
}
