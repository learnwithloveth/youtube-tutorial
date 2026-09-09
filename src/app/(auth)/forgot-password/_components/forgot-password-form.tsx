'use client';

import { useState } from 'react';
import { ArrowRight, Check, MailCheck } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { TextField } from '@/shared/ui/primitives/field';
import { AuthFooterLink, AuthHeading } from '../../_components/auth-shared';

export function ForgotPasswordForm() {

  const [sent, setSent] = useState(false);

  if (sent) {
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
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-5 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        title="Reset your password"
        body="Enter the email on your account and we will send a single-use link that expires in fifteen minutes."
      />

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
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

        <Button type="submit" size="lg" sheen className="w-full">
          Send reset link
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>

      <ul className="mt-8 space-y-2.5 rounded-md border border-line bg-surface p-5">
        {[
          'We never ask for your password over email or chat.',
          'Resetting does not affect your withdrawal allow-list.',
          'A reset triggers a 24-hour hold on new withdrawal addresses.',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-fg-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-up" />
            {item}
          </li>
        ))}
      </ul>

      <AuthFooterLink prompt="Remembered it?" label="Back to log in" to="/login" />
    </div>
  );
}
