'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { usePrefersReducedMotion } from '@/shared/lib/hooks';

/**
 * The page's entrance headline.
 *
 * Split into its own client leaf so the heroes that use it can stay Server
 * Components: an `motion.h1` anywhere in a file makes the entire file — and
 * everything it imports — part of the client bundle. Isolating the one animated
 * element keeps that cost to this file, and the heading text itself still
 * arrives as server-rendered HTML through `children`.
 */
export function AnimatedHeading({
  children,
  className,
  delay = 0,
  duration = 0.8,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.h1
      initial={reduced ? false : { opacity: 0, y: 22, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.h1>
  );
}

/** Generic entrance wrapper for a non-heading element, e.g. the hero panel. */
export function AnimatedPanel({
  children,
  className,
  delay = 0,
  duration = 1,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const reduced = usePrefersReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
