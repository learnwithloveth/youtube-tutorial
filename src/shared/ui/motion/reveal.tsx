'use client';

import { motion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

import { usePrefersReducedMotion } from '@/shared/lib/hooks';

import { fadeUp, stagger } from './variants';

/**
 * Scroll-triggered entrance.
 *
 * A Client Component by necessity — it observes intersection and animates — but
 * a *leaf* one. Because Server Components can pass their rendered output through
 * a Client Component's `children`, wrapping a server-rendered section in
 * `<Reveal>` animates it without moving the section itself into the client
 * bundle. The section's markup arrives as HTML; only the wrapper hydrates.
 *
 * Reduced motion renders the plain element with no observer and no animation, so
 * content is never left invisible waiting for a callback that will not come.
 */

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  variants?: Variants;
  /** Fraction of the element that must be visible before it animates in. */
  amount?: number;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}

export function Reveal({
  children,
  className,
  delay = 0,
  variants = fadeUp,
  amount = 0.05,
  as = 'div',
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const Component = motion[as];

  if (reduced) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount, margin: '0px 0px -4% 0px' }}
      variants={variants}
      transition={{ delay }}
    >
      {children}
    </Component>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
  amount?: number;
}

export function StaggerGroup({
  children,
  className,
  delayChildren = 0.04,
  staggerChildren = 0.07,
  amount = 0.05,
}: StaggerProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={stagger(delayChildren, staggerChildren)}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  variants = fadeUp,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}
