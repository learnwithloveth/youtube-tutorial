import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export type BadgeTone = 'brand' | 'accent' | 'up' | 'down' | 'neutral' | 'warn';

const TONES: Record<BadgeTone, string> = {
  brand:
    'text-brand-soft bg-[color-mix(in_oklab,var(--brand)_16%,transparent)] border-[color-mix(in_oklab,var(--brand)_36%,transparent)]',
  accent:
    'text-accent bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] border-[color-mix(in_oklab,var(--accent)_34%,transparent)]',
  up: 'text-up bg-[color-mix(in_oklab,var(--up)_14%,transparent)] border-[color-mix(in_oklab,var(--up)_32%,transparent)]',
  down: 'text-down bg-[color-mix(in_oklab,var(--down)_14%,transparent)] border-[color-mix(in_oklab,var(--down)_32%,transparent)]',
  warn: 'text-warn bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] border-[color-mix(in_oklab,var(--warn)_32%,transparent)]',
  neutral: 'text-fg-muted bg-surface border-line',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
