'use client';


import { BRAND } from '@/modules/content';
import { ActiveLink } from '@/shared/ui/primitives/active-link';
import { ArrowLeft, ChevronsLeft } from 'lucide-react';
import { ADMIN_NAV } from '../_data/navigation';
import { LogoMark } from '@/shared/ui/visuals/logo';
import { useQueues } from '../_data/store';
import { cn } from '@/shared/lib/cn';

/**
 * The admin rail is deliberately not the customer rail.
 *
 * An operator with both open needs to know which one they are typing into
 * before they read a word, so this one carries the console wordmark, an
 * environment stripe, and a sunken ground rather than the app's raised one.
 */
export function AdminSidebar({
  collapsed, onToggle, variant = 'rail', onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  variant?: 'rail' | 'drawer';
  onNavigate?: () => void;
}) {
  const queues = useQueues();
  const isRail = variant === 'rail';
  const showLabels = !isRail || !collapsed;

  return (
    <div className="flex h-full flex-col border-r border-line bg-bg-sunken">
      <span aria-hidden className="h-0.5 shrink-0 bg-gradient-to-r from-warn via-brand to-accent" />

      <div className={cn('flex h-[3.75rem] shrink-0 items-center px-4', showLabels ? 'justify-between' : 'justify-center')}>
        <ActiveLink href="/admin" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5" aria-label={`${BRAND.name} console`}>
          <LogoMark className="size-8" />
          {showLabels ? (
            <span className="min-w-0 leading-tight">
              <span title={BRAND.name} className="block truncate font-display text-sm font-bold tracking-[-0.03em] text-fg">{BRAND.wordmark}</span>
              <span className="block font-mono text-[0.6rem] uppercase tracking-[0.22em] text-warn">Console</span>
            </span>
          ) : null}
        </ActiveLink>
        {isRail && showLabels ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="grid size-8 place-items-center rounded-sm text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
          >
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Admin console" className="flex-1 overflow-y-auto px-3 py-2">
        {ADMIN_NAV.map((group) => (
          <div key={group.heading} className="mb-5">
            {showLabels ? (
              <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                {group.heading}
              </p>
            ) : (
              <div aria-hidden className="mx-3 mb-3 h-px bg-line" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const count = item.queue ? queues[item.queue] : 0;
                return (
                  <li key={item.href}>
                    <ActiveLink
                      href={item.href}
                      end={item.end}
                      onClick={onNavigate}
                      title={showLabels ? undefined : item.label}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-200',
                          showLabels ? 'justify-start' : 'justify-center',
                          isActive
                            ? 'bg-surface-strong font-medium text-fg'
                            : 'text-fg-muted hover:bg-surface hover:text-fg',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            aria-hidden
                            className={cn(
                              'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-warn transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <item.icon className={cn('size-4 shrink-0', isActive && 'text-warn')} />
                          {showLabels ? (
                            <>
                              <span className="flex-1 truncate">{item.label}</span>
                              {count > 0 ? (
                                <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-warn">
                                  {count}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <span className="sr-only">
                                {item.label}
                                {count > 0 ? `, ${count} waiting` : ''}
                              </span>
                              {count > 0 ? (
                                <span aria-hidden className="absolute right-2 top-1.5 size-1.5 rounded-full bg-warn" />
                              ) : null}
                            </>
                          )}
                        </>
                      )}
                    </ActiveLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <ActiveLink
          href="/app"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg',
            !showLabels && 'justify-center',
          )}
        >
          <ArrowLeft className="size-4 shrink-0" />
          {showLabels ? 'Back to the app' : <span className="sr-only">Back to the customer app</span>}
        </ActiveLink>
      </div>
    </div>
  );
}
