import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the gradient hairline edge. */
  edge?: boolean;
  children: ReactNode;
}

export const CARD_BASE =
  'relative overflow-hidden rounded-lg bg-surface backdrop-blur-xl shadow-card ' +
  'border border-line transition-colors duration-500 ease-[var(--ease-out-expo)]';

/**
 * The default surface: a Server Component with no JavaScript at all.
 *
 * The original design gave every card the cursor-tracked spotlight, which meant
 * a hook, which in the App Router would mean shipping every page that uses a
 * card to the client. Cards appear on all twenty-five pages, so that is the
 * difference between a marketing site that is mostly HTML and one that is mostly
 * bundle. Where the pointer highlight is actually wanted, use
 * `InteractiveCard` — the same surface, opted into deliberately.
 */
export function Card({ edge = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cn(CARD_BASE, edge && 'hairline', className)} {...rest}>
      {children}
    </div>
  );
}
