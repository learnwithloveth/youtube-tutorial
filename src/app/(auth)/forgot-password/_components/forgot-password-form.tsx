'use client';

import { ArrowRight, Check, MailCheck } from 'lucide-react';
import { useActionState } from 'react';

import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { TextField } from '@/shared/ui/primitives/field';

import { requestPasswordResetAction } from '../../actions';
import { IDLE_FORM_STATE } from '../../_lib/form-state';
import { AuthFooterLink, AuthHeading } from '../../_components/auth-shared';
import { SubmitButton } from '../../_components/submit-button';

const ASSURANCES = [
  'We never ask for your password over email or chat.',
  'Resetting does not affect your withdrawal allow-list.',
  'A reset triggers a 24-hour hold on new withdrawal addresses.',
];

/**
 * Password reset request.
 *
 * The confirmation panel is shown for *every* submission, including addresses with
 * no account. That is the point: distinguishing them would turn this form into an
 * account-enumeration oracle, letting an attacker submit a list of addresses and
 * learn which are registered. The action behaves identically either way, and this
 * screen reports identically too.
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, IDLE_FORM_STATE);

  if (state.message) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full border border-line bg-surface text-up">
          <MailCheck className="size-6" />
        </span>
        <h1 className="mt-7 text-3xl font-semibold">Check your inbox</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          If an account exists for that address, a reset link is on its way. It expires in fifteen
          minutes and can only be used once.
        </p>
        <ButtonLink href="/login" variant="outline" size="lg" className="mt-8 w-full">
          Back to log in
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        title="Reset your password"
        body="Enter the email on your account and we will send a single-use link that expires in fifteen minutes."
      />

      <form action={formAction} className="space-y-5">
        <TextField
          label="Email address"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />

        <SubmitButton pendingLabel="Sending…" className="w-full">
          Send reset link
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </SubmitButton>
      </form>

      <ul className="mt-8 space-y-2.5 rounded-md border border-line bg-surface p-5">
        {ASSURANCES.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-fg-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-up" />
            {item}
          </li>
        ))}
      </ul>

      <AuthFooterLink prompt="Remembered it?" label="Back to log in" href="/login" />
    </div>
  );
}
