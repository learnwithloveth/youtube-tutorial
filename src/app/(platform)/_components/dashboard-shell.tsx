'use client';

import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

import type { NotificationDto } from '@/server/notifications';
import { cn } from '@/shared/lib/cn';
import { useEscape, useScrollLock } from '@/shared/lib/hooks';

import { MobileTabBar } from './mobile-tab-bar';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

const COLLAPSE_KEY = 'novex.dash.collapsed';

/**
 * The application shell.
 *
 * Denser than the marketing pages on purpose: a dashboard is scanned and
 * operated, not read top to bottom, so the rhythm tightens and the surface
 * darkens by one step to sit behind cards rather than compete with them.
 *
 * A Client Component because it owns the rail's collapsed state and the mobile
 * drawer. The gate that decides whether any of this renders lives in the layout
 * above, on the server — the shell never checks a session itself.
 */
export function DashboardShell({
  name,
  initials,
  emailVerified,
  email,
  notifications,
  unread,
  notice,
  children,
}: {
  /** The signed-in account, resolved once at the identity boundary. */
  name: string;
  initials: string;
  emailVerified: boolean;
  email: string;
  /** The bell's contents, read on the server by the layout above. */
  notifications: readonly NotificationDto[];
  unread: number;
  /**
   * Platform notices, rendered by the server layout above.
   *
   * Passed in as a slot rather than imported: this shell is a Client Component
   * and the banner is an async Server Component that reads the database. A
   * Server Component cannot be imported into a client module, but it can be
   * handed to one as a prop — which keeps the query on the server and ships no
   * extra JavaScript for a notice that is usually absent.
   */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useScrollLock(drawer);
  useEscape(() => setDrawer(false), drawer);

  // Close the drawer when a navigation completes. Adjusting state during render
  // rather than in an effect — the effect version paints the stale open drawer
  // first, and React 19 flags it.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawer(false);
  }

  // Read after mount rather than in a lazy initialiser: the server has no
  // localStorage, so initialising from it would render a different rail width on
  // the server than on the client and fail hydration.
  const [restored, setRestored] = useState(false);
  if (!restored && typeof window !== 'undefined') {
    setRestored(true);
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      /* storage throws in private mode — the default stands */
    }
  }

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-dvh bg-bg-sunken">
      <a
        href="#dashboard-main"
        className="sr-only rounded-full bg-brand px-5 py-2 text-sm font-medium text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
      >
        Skip to content
      </a>

      <div
        className={cn(
          'lg:grid lg:min-h-dvh',
          collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]',
        )}
      >
        <aside className="sticky top-0 hidden h-dvh lg:block">
          <Sidebar collapsed={collapsed} onToggle={toggle} unread={unread} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <TopBar
            name={name}
            initials={initials}
            email={email}
            emailVerified={emailVerified}
            notifications={notifications}
            unread={unread}
            onOpenDrawer={() => setDrawer(true)}
          />
          {notice}
          <main id="dashboard-main" className="flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8">
            {children}
          </main>
        </div>
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand sidebar"
          className="fixed bottom-5 left-5 z-30 hidden size-9 place-items-center rounded-full border border-line bg-bg-elev text-fg-subtle shadow-card transition-colors hover:text-fg lg:grid"
        >
          <span aria-hidden>›</span>
        </button>
      ) : null}

      <MobileTabBar onMore={() => setDrawer(true)} />

      <AnimatePresence>
        {drawer ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-50 bg-bg-sunken/70 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard menu"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:hidden"
            >
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 z-10 grid size-8 place-items-center rounded-sm text-fg-subtle hover:text-fg"
              >
                <X className="size-4" />
              </button>
              <Sidebar
                collapsed={false}
                onToggle={toggle}
                variant="drawer"
                unread={unread}
                onNavigate={() => setDrawer(false)}
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
