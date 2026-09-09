'use client';

import { MailWarning } from 'lucide-react';
import { useActionState } from 'react';

import { resendVerificationAction } from '../(auth)/actions';
import { IDLE_FORM_STATE } from '../(auth)/_lib/form-state';

/**
 * Prompts a signed-in user to confirm their address.
 *
 * Shown rather than enforced. Registration issues a session immediately — an
 * account with nothing in it is not worth a verification wall — so the unconfirmed
 * state has to be visible somewhere, and this is it. The gate belongs on the
 * actions that genuinely need a reachable address, not on browsing.
 *
 * `useActionState` with no arguments: the action reads the session itself rather
 * than taking a user id, because an action is a public endpoint and a caller-
 * supplied id would be an authorisation bug waiting to happen.
 */
export function VerificationBanner({ email }: { email: string }) {
  const [state, formAction] = useActionState(resendVerificationAction, IDLE_FORM_STATE);

  return (
    <div className="border-b border-line bg-[color-mix(in_oklab,var(--warn)_12%,transparent)]">
      <div className="shell flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2.5 text-center text-xs">
        <MailWarning aria-hidden className="size-4 shrink-0 text-warn" />
        <span className="text-fg-muted">
          Confirm <span className="font-medium text-fg">{email}</span> to secure your account.
        </span>
        <form action={formAction}>
          <button
            type="submit"
            className="font-semibold text-brand-soft underline-offset-4 hover:underline"
          >
            Resend the link
          </button>
        </form>
        <span aria-live="polite" className={state.error ? 'text-down' : 'text-up'}>
          {state.error ?? state.message}
        </span>
      </div>
    </div>
  );
}
