'use client';

import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useActionState, useState } from 'react';

import { PASSWORD_MIN_LENGTH } from '@/modules/identity';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { TextField } from '@/shared/ui/primitives/field';

import { resetPasswordAction } from '../../actions';
import { IDLE_FORM_STATE } from '../../_lib/form-state';
import { AuthHeading, PasswordStrength } from '../../_components/auth-shared';
import { FormFeedback } from '../../_components/form-feedback';
import { SubmitButton } from '../../_components/submit-button';

/**
 * Choose a new password from a reset link.
 *
 * On success the action redirects to the login screen: every session was revoked,
 * including any an attacker held, so there is nothing to return to. Making the user
 * sign in again with the new password is the confirmation that the reset worked.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, IDLE_FORM_STATE);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  // A link with no token cannot be redeemed, and posting an empty one just to be
  // told so wastes a round trip and reads as a bug.
  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-semibold">That link is incomplete</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Open the link from your email exactly as it was sent, or request a new one.
        </p>
        <ButtonLink href="/forgot-password" size="lg" className="mt-8 w-full">
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        title="Choose a new password"
        body="Pick something you have not used elsewhere. Signing in on your other devices will be required again."
      />

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="token" value={token} />

        <FormFeedback state={state} />

        <div>
          <TextField
            label="New password"
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

        <TextField
          label="Confirm new password"
          type="password"
          name="confirmPassword"
          required
          autoComplete="new-password"
          placeholder="Type it again"
        />

        <SubmitButton pendingLabel="Updating…" className="w-full">
          Update password
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </SubmitButton>
      </form>
    </div>
  );
}
