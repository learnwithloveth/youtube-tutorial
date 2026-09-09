'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { TextField, SelectField } from '@/shared/ui/primitives/field';
import { AuthFooterLink, AuthHeading, PasswordStrength, SocialAuth } from '../../_components/auth-shared';

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

export function SignupForm() {

  const router = useRouter();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <AuthHeading
        title="Create your account"
        body="About forty seconds. Then two minutes to verify, and you can trade."
      />

      <SocialAuth verb="Sign up" />

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          router.push('/verify-identity');
        }}
      >
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
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
            adornment={
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
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

        <Button type="submit" size="lg" sheen className="w-full">
          Create account
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>

      <AuthFooterLink prompt="Already have an account?" label="Log in" to="/login" />
    </div>
  );
}
