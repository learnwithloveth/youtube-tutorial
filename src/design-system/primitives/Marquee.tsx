import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Infinite horizontal rail. The track is duplicated and translated -50%, which
 * makes the loop seamless without measuring anything at runtime.
 */
export function Marquee({
  children,
  durationSec = 40,
  reverse = false,
  className,
}: {
  children: ReactNode;
  durationSec?: number;
  reverse?: boolean;
  className?: string;
}) {
  const style = {
    '--marquee-duration': `${durationSec}s`,
    animationDirection: reverse ? 'reverse' : 'normal',
  } as CSSProperties;

  return (
    <div className={cn('marquee mask-x', className)} aria-hidden>
      <div style={style}>
        {children}
        {children}
      </div>
    </div>
  );
}
