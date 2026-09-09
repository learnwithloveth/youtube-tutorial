'use client';

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { useSpotlight } from '@/shared/lib/hooks';

import { CARD_BASE } from './card';

export interface InteractiveCardProps extends HTMLAttributes<HTMLDivElement> {
  edge?: boolean;
  children: ReactNode;
}

/**
 * A card that tracks the cursor.
 *
 * The pointer handler writes --mx/--my straight onto the element's style, so the
 * highlight is painted by CSS and React never re-renders on mouse movement.
 * That is the only reason this is affordable at all: a state update per
 * pointermove would drop frames on a page with a dozen cards.
 */
export function InteractiveCard({
  edge = true,
  className,
  children,
  ...rest
}: InteractiveCardProps) {
  const { ref, onPointerMove } = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn(
        CARD_BASE,
        'spotlight hover:border-line-strong',
        edge && 'hairline',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
