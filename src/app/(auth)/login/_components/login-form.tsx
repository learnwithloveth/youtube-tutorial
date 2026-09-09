'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { TextField } from '@/shared/ui/primitives/field';
import { AuthFooterLink, AuthHeading, SocialAuth } from '../../_components/auth-shared';

export function LoginForm() {

  const router = useRouter();
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <AuthHeading title="Welcome back" body="Sign in to your account. Passkeys are faster and phishing-resistant." />

      <button
        type="button"
        onClick={() => router.push('/two-factor')}
        className="mb-7 flex h-13 w-full items-center justify-center gap-2.5 rounded-md border border-brand-soft/40 bg-brand/12 text-sm font-medium text-fg transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand/20"
      >
        <Fingerprint className="size-5 text-brand-soft" />
        Sign in with a passkey
      </button>

      <SocialAuth verb="Log in" />

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          router.push('/two-factor');
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
            autoComplete="current-password"
            placeholder="Your password"
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
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2.5 text-sm text-fg-muted">
              <input
                type="checkbox"
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

        <Button type="submit" size="lg" sheen className="w-full">
          Log in
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>

      <AuthFooterLink prompt="New to Novex?" label="Create an account" to="/signup" />
    </div>
  );
}
