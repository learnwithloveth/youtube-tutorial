import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { fadeUp, stagger } from './variants';
import { usePrefersReducedMotion } from '@/lib/hooks';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  variants?: Variants;
  /** Fraction of the element that must be visible before it animates in. */
  amount?: number;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}

/**
 * Scroll-triggered entrance. Animates once, respects reduced-motion, and never
 * leaves content invisible if the observer never fires (progressive enhancement).
 */
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
