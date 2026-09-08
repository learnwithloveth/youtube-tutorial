import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { PRIMARY_NAV } from '@/data/navigation';
import { Wordmark } from '@/components/visuals/Logo';
import { ButtonLink } from '@/design-system/primitives/Button';
import { ThemeToggle } from './ThemeToggle';
import { MegaMenuPanel } from './MegaMenu';
import { MobileNav } from './MobileNav';
import { AnnouncementBar } from './AnnouncementBar';
import { useEscape, useScrolled } from '@/lib/hooks';
import { cn } from '@/lib/cn';

export function Navbar() {
  const [open, setOpen] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const scrolled = useScrolled(10);
  const location = useLocation();
  const closeTimer = useRef<number | undefined>(undefined);

  const close = useCallback(() => setOpen(null), []);
  useEscape(close, open !== null);

  useEffect(() => {
    setOpen(null);
    setDrawer(false);
  }, [location.pathname]);

  /** Small grace period so diagonal cursor travel into the panel doesn't close it. */
  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  }, []);
  const cancelClose = useCallback(() => window.clearTimeout(closeTimer.current), []);

  const activeColumn = open === null ? null : (PRIMARY_NAV[open] ?? null);

  return (
    <>
      <AnnouncementBar />
      <header
        className={cn(
          'sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500',
          scrolled
            ? 'border-b border-line bg-bg/72 backdrop-blur-xl backdrop-saturate-150'
            : 'border-b border-transparent bg-transparent',
        )}
        onMouseLeave={scheduleClose}
      >
        <nav aria-label="Primary" className="shell flex h-18 items-center gap-6 py-4">
          <Link to="/" className="shrink-0" aria-label="Novex home">
            <Wordmark />
          </Link>

          {/*
            The panel is anchored to this wrapper — the left edge of the nav
            list — rather than centred on each trigger. Centring a 46rem panel
            on the first item pushed it past the viewport edge; a single shared
            origin inside the content rail can never overflow.
          */}
          <div className="relative hidden lg:block">
            <ul className="flex items-center gap-1">
              {PRIMARY_NAV.map((column, index) => {
                const isOpen = open === index;
                return (
                  <li
                    key={column.label}
                    onMouseEnter={() => {
                      cancelClose();
                      setOpen(index);
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      onFocus={() => setOpen(index)}
                      onClick={() => setOpen(isOpen ? null : index)}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-300',
                        isOpen ? 'text-fg' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      {column.label}
                      <ChevronDown
                        className={cn(
                          'size-3.5 transition-transform duration-300',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            <AnimatePresence>
              {activeColumn ? (
                <div
                  className="absolute left-0 top-full z-50 pt-3"
                  onMouseEnter={cancelClose}
                >
                  <MegaMenuPanel column={activeColumn} onNavigate={close} />
                </div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:grid" />
            <ButtonLink to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Log in
            </ButtonLink>
            <ButtonLink to="/signup" size="sm" className="hidden sm:inline-flex">
              Get started
            </ButtonLink>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border border-line text-fg lg:hidden"
              aria-label={drawer ? 'Close menu' : 'Open menu'}
              aria-expanded={drawer}
              onClick={() => setDrawer((v) => !v)}
            >
              {drawer ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>

        {/* Scrim: dims the page behind an open mega-menu without blocking it. */}
        <AnimatePresence>
          {open !== null ? (
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none fixed inset-0 top-18 -z-10 bg-bg/72 backdrop-blur-[3px]"
            />
          ) : null}
        </AnimatePresence>
      </header>

      <MobileNav open={drawer} onClose={() => setDrawer(false)} />
    </>
  );
}
