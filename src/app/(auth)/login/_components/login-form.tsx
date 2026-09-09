'use client';

import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActionState, useState } from 'react';

import { TextField } from '@/shared/ui/primitives/field';

import { signInAction } from '../../actions';
import { IDLE_FORM_STATE } from '../../_lib/form-state';
import { AuthFooterLink, AuthHeading, SocialAuth } from '../../_components/auth-shared';
import { FormFeedback } from '../../_components/form-feedback';
import { SubmitButton } from '../../_components/submit-button';

/**
 * Sign-in.
 *
 * `useActionState` posts to the Server Action and returns whatever it gives back.
 * The form is a real `<form action={...}>`, so it works before hydration too — a
 * submit on a slow connection performs an ordinary POST and gets a server-rendered
 * response rather than doing nothing until the bundle arrives.
 *
 * The passkey and social buttons are still design-only; they are marked `disabled`
 * rather than wired to a navigation that would imply they signed you in.
 */
export function LoginForm() {
  const [state, formAction] = useActionState(signInAction, IDLE_FORM_STATE);
  const [visible, setVisible] = useState(false);
  const searchParams = useSearchParams();

  // Where to land after signing in. Carried through the form so the action can
  // validate it server-side — a redirect target from a query string is attacker
  // input until something checks it.
  const next = searchParams.get('next') ?? '';
  const justReset = searchParams.get('reset') === '1';

  return (
    <div>
      <AuthHeading
        title="Welcome back"
        body="Sign in to your account. Passkeys are faster and phishing-resistant."
      />

      {justReset ? (
        <p
          role="status"
          className="mb-6 rounded-md border border-[color-mix(in_oklab,var(--up)_32%,transparent)] bg-[color-mix(in_oklab,var(--up)_12%,transparent)] px-3.5 py-2.5 text-sm text-up"
        >
          Your password has been changed. Sign in with your new password.
        </p>
      ) : null}

      <SocialAuth verb="Log in" />

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        <FormFeedback state={state} />

        <TextField
          label="Email address"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />

        <div>
          <TextField
            label="Password"
            type={visible ? 'text' : 'password'}
            name="password"
            required
            autoComplete="current-password"
            placeholder="Your password"
            adornment={
              <button
                type="button"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                className="transition-colors hover:text-fg"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2.5 text-sm text-fg-muted">
              <input
                type="checkbox"
                name="remember"
                className="size-4 rounded-xs border-line accent-[var(--brand)]"
              />
              Keep me signed in
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-brand-soft underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <SubmitButton pendingLabel="Signing in…" className="w-full">
          Log in
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </SubmitButton>
      </form>

      <AuthFooterLink prompt="New to Novex?" label="Create an account" href="/signup" />
    </div>
  );
}
