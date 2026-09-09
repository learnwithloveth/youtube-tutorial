'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/shared/ui/primitives/button';
import { SelectField, TextField } from '@/shared/ui/primitives/field';

const FIRM_TYPES = [
  { value: 'fund', label: 'Hedge fund / asset manager' },
  { value: 'mm', label: 'Market maker' },
  { value: 'treasury', label: 'Corporate treasury' },
  { value: 'family', label: 'Family office' },
  { value: 'bank', label: 'Bank / broker' },
  { value: 'other', label: 'Other' },
];

const VOLUMES = [
  { value: '1-10', label: '$1M – $10M' },
  { value: '10-50', label: '$10M – $50M' },
  { value: '50-250', label: '$50M – $250M' },
  { value: '250+', label: '$250M+' },
];

const INTERESTS = [
  { value: 'otc', label: 'OTC block trading' },
  { value: 'custody', label: 'Prime custody' },
  { value: 'api', label: 'FIX / API connectivity' },
  { value: 'reporting', label: 'Regulatory reporting' },
];

/**
 * Institutional desk enquiry.
 *
 * The page's only interactive element, extracted so the rest of it — a long
 * document of capabilities and figures — is server-rendered. No enquiry is
 * transmitted anywhere; this is a demonstration site, and the form says only
 * that it received the request.
 */
export function DeskEnquiryForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Full name"
          name="name"
          required
          autoComplete="name"
          placeholder="Ada Lovelace"
        />
        <TextField
          label="Work email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@fund.com"
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Firm" name="firm" required placeholder="Meridian Capital" />
        <SelectField label="Firm type" name="type" options={FIRM_TYPES} />
      </div>
      <SelectField label="Expected monthly volume" name="volume" options={VOLUMES} />
      <SelectField label="Primary interest" name="interest" options={INTERESTS} />
      <Button type="submit" size="lg" sheen className="w-full">
        {sent ? (
          <>
            <Check className="size-4" />
            Request received
          </>
        ) : (
          'Request a call'
        )}
      </Button>
      <p aria-live="polite" className="text-center text-sm text-up">
        {sent ? 'The desk will reach out within one business day.' : ''}
      </p>
      <p className="text-center text-xs text-fg-subtle">
        We will only use these details to respond to your enquiry.
      </p>
    </form>
  );
}
