import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

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

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Adds the animated light sweep — reserve it for the single primary CTA. */
  sheen?: boolean;
  children?: ReactNode;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

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

export type ButtonLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; external?: boolean };

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  sheen = false,
  className,
  to,
  external,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(buttonStyles(variant, size, className), sheen && 'sheen');
  const content = (
    <>
      {sheen ? <span aria-hidden className="sheen-bar" /> : null}
      {children}
    </>
  );

  if (external) {
    return (
      <a className={classes} href={to} target="_blank" rel="noreferrer noopener" {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link className={classes} to={to} {...rest}>
      {content}
    </Link>
  );
}
