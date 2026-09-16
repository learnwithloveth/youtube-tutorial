'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';

import { cn } from '@/shared/lib/cn';

import { resendVerificationAction } from '../(auth)/actions';
import { IDLE_FORM_STATE } from '../(auth)/_lib/form-state';

/**
 * "Resend the link", as a submission rather than a link.
 *
 * ── Why a form and not an `<a href>` ──────────────────────────────────────────
 * Issuing a token and sending mail is a mutation. Behind a link it would be a GET
 * that a prefetch, a scanner or an `<img>` tag could fire, and every one of those
 * would invalidate the link already sitting in somebody's inbox — the new token
 * supersedes the old one.
 *
 * The dashboard banner and the account menu both used to link to `/verify-email`,
 * which *consumes* a token rather than issuing one. With no token in the URL it
 * answered "That link did not work", and nothing was ever sent. This is that bug's
 * fix, in one place, so the three surfaces that offer a resend cannot drift.
 *
 * ── No user id crosses the wire ───────────────────────────────────────────────
 * `useActionState` with an action that takes no arguments: it reads the session
 * itself, because an action is a public endpoint and a caller-supplied id would let
 * anyone post mail to somebody else's address.
 *
 * The result is rendered next to the control, so "nothing appeared to happen" is
 * never the whole feedback. Callers pass the classes, because this sits in a
 * warn-toned banner, a popover pill and a marketing bar, which style it differently.
 */
export function ResendVerification({
  children,
  className,
  messageClassName,
  pendingLabel = 'Sending…',
}: {
  children: ReactNode;
  className?: string;
  messageClassName?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(resendVerificationAction, IDLE_FORM_STATE);
  const outcome = state.error ?? state.message;

  return (
    <>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className={cn(className, pending && 'opacity-60')}
        >
          {pending ? pendingLabel : children}
        </button>
      </form>
      {outcome === null || outcome === undefined ? null : (
        <span
          role="status"
          aria-live="polite"
          className={cn(state.error ? 'text-down' : 'text-up', messageClassName)}
        >
          {outcome}
        </span>
      )}
    </>
  );
}
