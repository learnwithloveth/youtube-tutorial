import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useSpotlight } from '@/lib/hooks';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the cursor-tracked radial highlight. */
  interactive?: boolean;
  /** Adds the gradient hairline edge. */
  edge?: boolean;
  children: ReactNode;
}

export function Card({ interactive, edge = true, className, children, ...rest }: CardProps) {
  const { ref, onPointerMove } = useSpotlight<HTMLDivElement>();
  return (
    <div
      ref={ref}
      onPointerMove={interactive ? onPointerMove : undefined}
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface backdrop-blur-xl shadow-card',
        'border border-line transition-colors duration-500 ease-[var(--ease-out-expo)]',
        edge && 'hairline',
        interactive && 'spotlight hover:border-line-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
