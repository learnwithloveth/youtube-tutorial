'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Adds the animated light sweep — reserve it for the single primary CTA. */
  sheen?: boolean;
  children?: ReactNode;
}

/**
 * A real `<button>`. Client-side because its whole purpose is to carry an
 * `onClick`; anything that merely navigates should use `ButtonLink`, which
 * renders an anchor and ships no JavaScript.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', sheen = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonStyles(variant, size, className), sheen && 'sheen')}
      {...rest}
    >
      {sheen ? <span aria-hidden className="sheen-bar" /> : null}
      {children}
    </button>
  );
});
