'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { formatAccountNumber } from '@/modules/identity';
import { cn } from '@/shared/lib/cn';

/**
 * The account holder's own number, with a way to take it away.
 *
 * ── A client component for one reason: the clipboard ──────────────────────────
 * The number itself is rendered on the server and arrives as a prop. The only
 * thing needing the browser is the copy button — this is the smallest leaf that
 * needs `'use client'`, which is where the directive belongs rather than on the
 * page that contains it.
 *
 * ── Displayed grouped, copied ungrouped ───────────────────────────────────────
 * The groups exist so the number can be read and said out loud without losing
 * your place. What lands on the clipboard is the ten bare digits, because the
 * next thing it is pasted into is a form — and although `AccountNumber.parse`
 * strips spaces, a value that survives every field without needing that leniency
 * is better than one that relies on it.
 */
export function AccountNumber({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleared on unmount, so a navigation away between the copy and the reset does
  // not leave a timer holding a setter for a component that is gone.
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // A refused clipboard — an insecure origin, a permission policy — is not
      // worth an error message. The number is on screen and can be read off it,
      // which is what the grouping is for.
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-3 py-1.5',
        className,
      )}
    >
      <span className="text-2xs uppercase tracking-[0.14em] text-fg-subtle">Account</span>
      <span data-numeric className="font-mono text-sm tracking-wide text-fg">
        {formatAccountNumber(value)}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Account number copied' : 'Copy account number'}
        className="grid size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
      >
        {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}
