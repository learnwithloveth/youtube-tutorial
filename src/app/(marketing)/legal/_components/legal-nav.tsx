'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/shared/lib/cn';

const DOCS = [
  { href: '/legal/terms', label: 'Terms of service' },
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/cookies', label: 'Cookie policy' },
];

/**
 * Document sidebar.
 *
 * A Client Component only because it marks the current document, which requires
 * knowing the path. `usePathname` replaces react-router's `NavLink isActive`;
 * `aria-current` carries the same information to assistive technology as the
 * highlight does visually.
 */
export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Legal documents" className="lg:sticky lg:top-28 lg:self-start">
      <p className="eyebrow mb-4">Legal centre</p>
      <ul className="space-y-1">
        {DOCS.map((doc) => {
          const active = pathname === doc.href;
          return (
            <li key={doc.href}>
              <Link
                href={doc.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors duration-200',
                  active
                    ? 'bg-surface font-medium text-fg'
                    : 'text-fg-muted hover:bg-surface hover:text-fg',
                )}
              >
                {doc.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
