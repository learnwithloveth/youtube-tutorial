'use client';

import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useActionState, useState } from 'react';

import { PASSWORD_MIN_LENGTH } from '@/modules/identity';
import { COUNTRIES } from '@/shared/lib/countries';
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

/**
 * Every country, not the eight the design listed.
 *
 * The short list ended in "Somewhere else", which is not a country of residence and
 * could not be stored as one — and now that the field is filled in from where the
 * request came from, a list that cannot represent the answer would default most of
 * the world to a neighbour's country or to nothing.
 *
 * The blank first option is deliberate: when the location is unknown there is no
 * honest default, and a select that opens on Afghanistan because it sorts first is
 * how somebody submits a country they never chose.
 */
const COUNTRY_OPTIONS = [
  { value: '', label: 'Select your country' },
  ...COUNTRIES.map(([code, name]) => ({ value: code, label: name })),
];

export function SignupForm({
  googleEnabled,
  detectedCountry,
  detectedDialCode,
}: {
  googleEnabled: boolean;
  /** ISO-3166-1 alpha-2 guessed from the request, or null. Never asserted as fact. */
  detectedCountry?: string | null | undefined;
  /** The dialling code for that country, when this application knows it. */
  detectedDialCode?: string | null | undefined;
}) {
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

        {/* Side by side above the address, which is the order these are asked for
            on every form anybody has filled in before this one. They stack on a
            phone, where two half-width fields would be two cramped ones. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="First name"
            name="firstName"
            required
            autoComplete="given-name"
            placeholder="Ada"
          />
          <TextField
            label="Last name"
            name="lastName"
            required
            autoComplete="family-name"
            placeholder="Lovelace"
          />
        </div>

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

        <SelectField
          label="Country of residence"
          name="country"
          options={COUNTRY_OPTIONS}
          defaultValue={detectedCountry ?? ''}
          // Says where the default came from, because a country worked out from a
          // network address is a guess — right most of the time, wrong behind a
          // VPN or a corporate proxy, and the person is the one who knows.
          hint={
            detectedCountry
              ? 'Filled in from your connection. Change it if that is not where you live.'
              : undefined
          }
        />

        <TextField
          label="Phone number"
          type="tel"
          name="phone"
          autoComplete="tel"
          // Pre-filled with the dialling code for the detected country when this
          // application knows it, and left empty when it does not — an invented
          // prefix is a number that cannot be dialled.
          defaultValue={detectedDialCode ? `${detectedDialCode} ` : ''}
          placeholder="+41 79 123 45 67"
          // Says what it is not, where somebody is deciding whether to hand it
          // over: there is no SMS in this application, so a number here is not a
          // second factor and not a recovery route.
          hint="Optional. Include your dialling code. Nothing is sent to it yet."
        />

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
