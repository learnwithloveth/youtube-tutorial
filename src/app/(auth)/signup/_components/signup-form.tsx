'use client';

import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useActionState, useState } from 'react';

import { PASSWORD_MIN_LENGTH } from '@/modules/identity';
import { SelectField, TextField } from '@/shared/ui/primitives/field';

import { signUpAction } from '../../actions';
import { IDLE_FORM_STATE } from '../../_lib/form-state';
import {
  AuthFooterLink,
  AuthHeading,
  PasswordStrength,
  SocialAuth,
} from '../../_components/auth-shared';
import { FormFeedback } from '../../_components/form-feedback';
import { SubmitButton } from '../../_components/submit-button';

const COUNTRIES = [
  { value: 'ng', label: 'Nigeria' },
  { value: 'ch', label: 'Switzerland' },
  { value: 'sg', label: 'Singapore' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'us', label: 'United States' },
  { value: 'de', label: 'Germany' },
  { value: 'br', label: 'Brazil' },
  { value: 'other', label: 'Somewhere else' },
];

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, formAction] = useActionState(signUpAction, IDLE_FORM_STATE);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  return (
    <div>
      {/* Was "Then two minutes to verify, and you can trade." Identity verification
          is no longer a step after this form: sign-up ends in the application, and
          verification is started from Settings whenever the account holder likes.
          It was never two minutes, because a person reviews every document, and
          there is no order ticket to trade with — see `/app/trade`. */}
      <AuthHeading
        title="Create your account"
        body="About forty seconds. Identity verification can wait until you are ready."
      />

      <SocialAuth verb="Sign up" enabled={googleEnabled} />

      <form action={formAction} className="space-y-5">
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
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
          <PasswordStrength value={password} />
        </div>

        <SelectField label="Country of residence" name="country" options={COUNTRIES} />

        <label className="flex items-start gap-3 text-sm text-fg-muted">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            className="mt-0.5 size-4 shrink-0 rounded-xs border-line accent-[var(--brand)]"
          />
          <span>
            I am 18 or over and I accept the{' '}
            <a href="/legal/terms" className="text-brand-soft underline-offset-4 hover:underline">
              terms of service
            </a>{' '}
            and{' '}
            <a href="/legal/privacy" className="text-brand-soft underline-offset-4 hover:underline">
              privacy policy
            </a>
            .
          </span>
        </label>

        <SubmitButton pendingLabel="Creating your account…" className="w-full">
          Create account
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </SubmitButton>
      </form>

      <AuthFooterLink prompt="Already have an account?" label="Log in" href="/login" />
    </div>
  );
}
