'use client';

import { Check, MessageSquare } from 'lucide-react';
import { useState } from 'react';

import { BRAND } from '@/modules/content';
import { Button } from '@/shared/ui/primitives/button';
import { SelectField, TextAreaField, TextField } from '@/shared/ui/primitives/field';

const TOPICS = [
  { value: 'support', label: 'Account or trading support' },
  { value: 'institutional', label: 'Institutional & OTC' },
  { value: 'api', label: 'API and integrations' },
  { value: 'press', label: 'Press enquiry' },
  { value: 'security', label: 'Security disclosure' },
  { value: 'other', label: 'Something else' },
];

/**
 * The contact form.
 *
 * Extracted so the surrounding page — its hero, contact cards and support copy —
 * stays a Server Component. There is no inbox behind this: the site is a
 * demonstration, as the footer states, so the form validates its input and
 * acknowledges it rather than claiming to have delivered anything.
 */
export function ContactForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      className="mt-10 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Full name"
          name="name"
          autoComplete="name"
          required
          placeholder="Ada Lovelace"
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
      </div>
      <SelectField label="What is this about?" name="topic" options={TOPICS} />
      <TextAreaField
        label="Message"
        name="message"
        required
        placeholder="Tell us what you need. Please do not include passwords, 2FA codes or private keys."
        hint={`Never share credentials. ${BRAND.name} staff will never ask for them.`}
      />
      <Button type="submit" size="lg" sheen className="w-full sm:w-auto">
        {sent ? (
          <>
            <Check className="size-4" />
            Message sent
          </>
        ) : (
          <>
            <MessageSquare className="size-4" />
            Send message
          </>
        )}
      </Button>
      <p aria-live="polite" className="text-sm text-up">
        {sent ? 'Thanks — we will reply within one business day.' : ''}
      </p>
    </form>
  );
}
