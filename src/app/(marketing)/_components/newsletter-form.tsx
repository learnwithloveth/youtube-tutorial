'use client';

import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/shared/ui/primitives/button';

/**
 * The footer's newsletter capture.
 *
 * Split out of `Footer` so that the footer itself stays a Server Component:
 * this is the only interactive part of it, and marking the whole footer
 * `'use client'` would ship its four link columns, compliance list and legal
 * copy to the browser as JavaScript for no reason.
 *
 * There is no subscriber store behind this — the site is a demonstration, as the
 * disclaimer immediately below it says — so the form validates the address and
 * acknowledges it without claiming to have sent anything anywhere.
 */
export function NewsletterForm() {
  const [state, setState] = useState<'idle' | 'done'>('idle');

  return (
    <form
      className="mt-6 max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setState('done');
      }}
    >
      <label htmlFor="footer-email" className="text-sm text-fg-muted">
        Market intelligence, every Thursday.
      </label>
      <div className="mt-3 flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 backdrop-blur-md transition-colors focus-within:border-brand-soft">
        <input
          id="footer-email"
          type="email"
          required
          placeholder="you@company.com"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        <Button type="submit" size="sm" aria-label="Subscribe" className="px-4">
          {state === 'done' ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </div>
      <p className="mt-2 text-xs text-fg-subtle" aria-live="polite">
        {state === 'done' ? 'Subscribed — check your inbox.' : 'No spam. Unsubscribe anytime.'}
      </p>
    </form>
  );
}
