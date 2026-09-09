import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles';

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  sheen?: boolean;
  href: string;
  external?: boolean;
  children?: ReactNode;
}

/**
 * A button-shaped link. A Server Component: `next/link` prefetches and navigates
 * without this component needing to be in the client bundle, so a page full of
 * calls-to-action ships no JavaScript for them.
 *
 * External destinations render a plain anchor — `next/link`'s prefetching and
 * client-side routing mean nothing off-site, and `rel="noreferrer noopener"`
 * keeps the new tab from getting a handle on this window.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  sheen = false,
  className,
  href,
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
      <a className={classes} href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {content}
      </a>
    );
  }

  return (
    <Link className={classes} href={href} {...rest}>
      {content}
    </Link>
  );
}
