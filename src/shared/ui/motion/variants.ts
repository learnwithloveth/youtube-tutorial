import type { Transition, Variants } from 'motion/react';

/**
 * Shared motion vocabulary.
 *
 * Type-only imports from `motion/react`, so this module carries no runtime
 * dependency and can be imported from a Server Component without pulling the
 * animation library into its bundle.
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const springy: Transition = { type: 'spring', stiffness: 190, damping: 24, mass: 0.9 };
export const smooth: Transition = { duration: 0.7, ease: EASE_OUT_EXPO };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: smooth },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.9, ease: EASE_OUT_EXPO } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: springy },
};

/** Parent orchestrator — children opt in with the `fadeUp` variant. */
export function stagger(delayChildren = 0.05, staggerChildren = 0.08): Variants {
  return {
    hidden: {},
    show: { transition: { delayChildren, staggerChildren } },
  };
}
