'use client';

import { useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { formatCompact } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/hooks';

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
  durationMs?: number;
  className?: string;
}

/**
 * Animates a number from 0 to `value` the first time it scrolls into view.
 *
 * The figure starts at its final value rather than at zero, so the server's HTML
 * and the first client render agree and hydration is clean; the animation resets
 * to zero and runs only once the element is actually observed in the viewport.
 */
export function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  compact = false,
  durationMs = 1600,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView || reduced) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo — a fast settle reads as confident rather than sluggish.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, durationMs, reduced]);

  const text = compact
    ? formatCompact(display)
    : display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span ref={ref} data-numeric className={cn('tabular-nums', className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
