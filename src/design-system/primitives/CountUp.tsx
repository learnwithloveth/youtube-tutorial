import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { formatCompact } from '@/lib/format';
import { cn } from '@/lib/cn';

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
  durationMs?: number;
  className?: string;
}

/** Animates a number from 0 → value the first time it scrolls into view. */
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
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView || reduced) {
      if (reduced) setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo — fast settle reads as "confident", not sluggish.
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
