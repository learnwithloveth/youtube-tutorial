'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/**
 * A transaction hash, shortened for reading and copied in full.
 *
 * ── Why the middle is missing ─────────────────────────────────────────────────
 * Sixty-six characters is not a thing anybody reads, and every block explorer
 * ever built truncates the same way, because what a person actually does with a
 * hash is check its ends against another copy. The full value stays on the record
 * and is what reaches the clipboard — the shortening is a rendering choice and
 * never a stored one.
 *
 * ── A client component only for the clipboard ─────────────────────────────────
 * The shortened text is computed on the server and arrives as a prop. The copy
 * button is the one thing that needs the browser, so this is the smallest leaf
 * carrying `'use client'` rather than the table that contains it.
 */
export function TxHash({
  value,
  short,
  className,
}: {
  /** The hash in full. What goes to the clipboard. */
  value: string;
  /** The same hash with its middle removed. What is drawn. */
  short: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // worth an error message. The value is on screen and `title` has it whole.
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span title={value} className="font-mono text-xs text-fg-muted">
        {short}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Transaction hash copied' : 'Copy transaction hash'}
        className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
      >
        {copied ? <Check className="size-3 text-up" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}
