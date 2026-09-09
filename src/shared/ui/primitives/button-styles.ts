import { cn } from '@/shared/lib/cn';

/**
 * Button appearance, kept in its own module with no directive.
 *
 * Both the interactive `Button` (a Client Component) and the navigational
 * `ButtonLink` (a Server Component) need these classes. Importing them from a
 * file that carries `'use client'` would drag the whole client boundary into
 * every server-rendered page that only wanted a class string.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'group relative inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap ' +
  'transition-[transform,background-color,color,box-shadow,border-color] duration-300 ease-[var(--ease-out-expo)] ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45 select-none';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-on-brand shadow-brand hover:brightness-110 hover:-translate-y-0.5 ' +
    'hover:shadow-[0_24px_70px_-20px_var(--brand)]',
  secondary:
    'bg-surface-strong text-fg border border-line-strong backdrop-blur-md hover:bg-surface-hover hover:-translate-y-0.5',
  outline: 'border border-line-strong text-fg hover:bg-surface hover:border-brand-soft',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface',
  danger: 'bg-down text-white hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-sm',
  lg: 'h-13 px-8 text-base',
};

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}
