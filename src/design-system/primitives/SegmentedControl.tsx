import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/** Radio-group segmented control with a shared layout-animated thumb. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
  size = 'md',
  ariaLabel,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1 backdrop-blur-md',
        className,
      )}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              'relative rounded-full font-medium transition-colors duration-300',
              size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-5 py-2 text-sm',
              active ? 'text-on-brand' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-brand shadow-brand"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10">{segment.label}</span>
          </button>
        );
      })}
    </div>
  );
}
