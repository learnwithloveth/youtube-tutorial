'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * A link that knows whether it points at the current page.
 *
 * React Router's `NavLink` passed `{ isActive }` to render-prop `className` and
 * `children`. The App Router has no equivalent — `next/link` is a plain anchor —
 * so this rebuilds the same contract on top of `usePathname`, which is why the
 * ported navigation code reads almost unchanged.
 *
 * `end` mirrors NavLink's prop and matters more than it looks: without it,
 * `/app` is a prefix of `/app/portfolio` and the Overview item stays highlighted
 * on every page in the section. Index routes pass `end`; everything else matches
 * on prefix so a detail page keeps its parent lit.
 *
 * `aria-current="page"` carries the same information to assistive technology
 * that the styling carries visually. Without it the active item is only
 * distinguishable by colour, which is exactly the failure the design's own rail
 * mark exists to avoid.
 */

type RenderProp<T> = T | ((state: { isActive: boolean }) => T);

interface ActiveLinkProps
  extends Omit<ComponentPropsWithoutRef<typeof Link>, 'className' | 'children'> {
  href: string;
  /** Match the path exactly rather than by prefix. */
  end?: boolean;
  className?: RenderProp<string | undefined>;
  children?: RenderProp<ReactNode>;
}

export function ActiveLink({ href, end, className, children, ...rest }: ActiveLinkProps) {
  const pathname = usePathname();

  const isActive = end
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  const resolvedClassName = typeof className === 'function' ? className({ isActive }) : className;
  const resolvedChildren = typeof children === 'function' ? children({ isActive }) : children;

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={resolvedClassName}
      {...rest}
    >
      {resolvedChildren}
    </Link>
  );
}
