'use client';


import { ActiveLink } from '@/shared/ui/primitives/active-link';
import { MoreHorizontal } from 'lucide-react';
import { MOBILE_TABS } from '../_data/navigation';
import { cn } from '@/shared/lib/cn';

/**
 * Thumb-reachable destinations. Four fixed tabs plus "More", which opens the
 * same drawer the header hamburger does — one navigation model, two entry points.
 */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  return (
    <nav
      aria-label="Primary dashboard"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {MOBILE_TABS.map((tab) => (
          <li key={tab.href}>
            <ActiveLink
              href={tab.href}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-2xs transition-colors',
                  isActive ? 'text-fg' : 'text-fg-subtle',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className={cn('size-5', isActive && 'text-brand-soft')} />
                  {tab.label}
                </>
              )}
            </ActiveLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onMore}
            className="flex w-full flex-col items-center gap-1 py-2.5 text-2xs text-fg-subtle"
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
