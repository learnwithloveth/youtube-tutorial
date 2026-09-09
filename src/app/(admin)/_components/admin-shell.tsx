'use client';

import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { useEscape, useScrollLock } from '@/shared/lib/hooks';

import { AdminSidebar } from './admin-sidebar';
import { AdminTopBar } from './admin-top-bar';

const COLLAPSE_KEY = 'novex.admin.collapsed';

/**
 * The console chrome.
 *
 * Structurally the same as the dashboard shell but on the darker ground: this
 * is an operator surface, and the visual separation is deliberate — someone
 * should never be unsure which console they are looking at while approving a
 * withdrawal.
 *
 * The authorisation check is in the layout above, on the server. This component
 * never sees a session and cannot be relied on for access control.
 */
export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useScrollLock(drawer);
  useEscape(() => setDrawer(false), drawer);

  // Close the drawer once a navigation completes, adjusted during render rather
  // than in an effect so the stale open drawer is never painted.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawer(false);
  }

  // Restored after mount: the server has no localStorage, so reading it in an
  // initialiser would render a different rail width on each side and fail
  // hydration.
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
    <div className="min-h-dvh bg-bg">
      <a
        href="#admin-main"
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
          <AdminSidebar collapsed={collapsed} onToggle={toggle} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <AdminTopBar email={email} onOpenDrawer={() => setDrawer(true)} />
          <main id="admin-main" className="flex-1 px-4 pb-12 pt-6 md:px-6 md:pt-7">
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

      <AnimatePresence>
        {drawer ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-50 bg-bg-sunken/75 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Admin menu"
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
              <AdminSidebar
                collapsed={false}
                onToggle={toggle}
                variant="drawer"
                onNavigate={() => setDrawer(false)}
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
