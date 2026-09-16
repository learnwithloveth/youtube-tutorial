'use client';


import { ActiveLink } from '@/shared/ui/primitives/active-link';
import { ChevronsLeft, ShieldHalf } from 'lucide-react';
import { DASH_NAV } from '../_data/navigation';
import { Wordmark, LogoMark } from '@/shared/ui/visuals/logo';
import { cn } from '@/shared/lib/cn';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Rendered inside the mobile drawer, where collapsing makes no sense. */
  variant?: 'rail' | 'drawer';
  onNavigate?: () => void;
  /** Unread notifications, read on the server by the layout above. */
  unread?: number;
  /**
   * Whether this account may act in the console, decided on the server.
   *
   * Hiding the link is presentation, not protection: `/admin` is guarded by
   * `requireAdmin`, which answers a customer with a 404 rather than a refusal, so
   * as far as they are concerned the console is not a page. This stops the rail
   * advertising a door they cannot open — and stops it telling them the door is
   * there at all.
   */
  isAdmin?: boolean;
}

export function Sidebar({
  collapsed,
  onToggle,
  variant = 'rail',
  onNavigate,
  unread = 0,
  isAdmin = false,
}: SidebarProps) {
  const isRail = variant === 'rail';
  const showLabels = !isRail || !collapsed;

  // Opaque on purpose. This rail is always over the page ground, so a blur has
  // nothing to reveal — and a backdrop-filter layer here can hold a stale
  // snapshot across a theme switch, leaving a dark sidebar on a light page.
  return (
    <div className="flex h-full flex-col gap-6 border-r border-line bg-bg-elev">
      <div className={cn('flex h-16 shrink-0 items-center px-4', showLabels ? 'justify-between' : 'justify-center')}>
        <ActiveLink href="/" aria-label="Novex home" onClick={onNavigate}>
          {showLabels ? <Wordmark /> : <LogoMark />}
        </ActiveLink>
        {isRail ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'grid size-8 place-items-center rounded-sm text-fg-subtle transition-all duration-300 hover:bg-surface hover:text-fg',
              collapsed && 'hidden',
            )}
          >
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3">
        {DASH_NAV.map((group) => (
          <div key={group.heading} className="mb-6">
            {showLabels ? (
              <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                {group.heading}
              </p>
            ) : (
              <div aria-hidden className="mx-3 mb-3 h-px bg-line" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
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
                          ? 'bg-surface-hover font-medium text-fg'
                          : 'text-fg-muted hover:bg-surface hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active state is a rail mark plus weight, not colour alone. */}
                        <span
                          aria-hidden
                          className={cn(
                            'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-soft transition-opacity',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <item.icon className={cn('size-4 shrink-0', isActive && 'text-brand-soft')} />
                        {showLabels ? (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {/* The live count where an entry asks for it, the
                                literal otherwise. Zero renders nothing: a badge
                                reading "0" is a thing to check that is not there. */}
                            {item.unreadKey && unread > 0 ? (
                              <span className="rounded-full border border-brand-soft/40 bg-brand/12 px-1.5 py-0.5 text-2xs tabular-nums text-brand-soft">
                                {unread}
                              </span>
                            ) : item.badge ? (
                              <span className="rounded-full border border-line px-1.5 py-0.5 text-2xs tabular-nums text-fg-subtle">
                                {item.badge}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="sr-only">{item.label}</span>
                        )}
                      </>
                    )}
                  </ActiveLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* A "Gold tier · $312k more 30-day volume unlocks Platinum" card sat here,
          with a progress bar fixed at 62%. There are no trading tiers on this
          platform and no volume to measure, so it promised a ladder that does not
          exist. Removed rather than reworded: the honest version of that card is
          nothing.

          "Help & support" sat here too, pointing at the marketing contact page.
          The support widget in the corner of every one of these screens opens a
          real conversation with an agent, so the link sent people out of the
          application to a form to ask for something they could already ask for.

          The whole block is conditional now, rather than an empty bordered strip
          for the customers who see nothing in it. */}
      {isAdmin ? (
        <div className="shrink-0 border-t border-line p-3">
          <ActiveLink
            href="/admin"
            onClick={onNavigate}
            className={cn(
              'mt-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg',
              !showLabels && 'justify-center',
            )}
          >
            <ShieldHalf className="size-4 shrink-0 text-warn" />
            {showLabels ? 'Admin console' : <span className="sr-only">Admin console</span>}
          </ActiveLink>
        </div>
      ) : null}
    </div>
  );
}
