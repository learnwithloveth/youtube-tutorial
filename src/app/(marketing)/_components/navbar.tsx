'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { BRAND } from '@/modules/content';
import { cn } from '@/shared/lib/cn';
import { useScrolled } from '@/shared/lib/hooks';
import { Wordmark } from '@/shared/ui/visuals/logo';

import { SECTION_NAV } from '../_lib/navigation';
import { AnnouncementBar } from './announcement-bar';
import { MobileNav } from './mobile-nav';
import { ThemeToggle } from './theme-toggle';

/**
 * `account` is a slot, not an import.
 *
 * This component is interactive — a drawer and scroll state — so it has to be a
 * Client Component. The account area needs the session, which only the server can
 * read. Passing the already-rendered element through as a prop is what lets a
 * Server Component live inside a Client Component: it arrives as rendered output
 * rather than as a module the browser has to execute.
 *
 * ── Links, not menus ──────────────────────────────────────────────────────────
 * This used to open mega-menus over a scrim: four columns, sixteen destinations,
 * a hover grace period and a focus trap. The site is one page, so the header is
 * one row of links to its sections — see `_lib/navigation.ts`. Nothing here opens,
 * so nothing here has to be closed, described to a screen reader as expanded, or
 * kept open while the cursor travels diagonally into it.
 */
export function Navbar({
  account,
  mobileAccount,
}: {
  account: ReactNode;
  /** The same slot again, laid out for the drawer rather than the header row. */
  mobileAccount: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const scrolled = useScrolled(10);
  const pathname = usePathname();

  // Close the drawer when a navigation completes.
  //
  // Adjusting state during render rather than in an effect: this is React's
  // documented pattern for state that must reset when an input changes. The
  // effect version schedules a second render after the first has already painted
  // the stale open drawer, which is both a visible flicker and what React 19's
  // set-state-in-effect rule warns about.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawer(false);
  }

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
      >
        <nav aria-label="Primary" className="shell flex h-18 items-center gap-6 py-4">
          <Link href="/" className="min-w-0" aria-label={`${BRAND.name} home`}>
            <Wordmark />
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {SECTION_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-full px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors duration-300 hover:text-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:grid" />
            {account}
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border border-line text-fg lg:hidden"
              aria-label={drawer ? 'Close menu' : 'Open menu'}
              aria-expanded={drawer}
              onClick={() => setDrawer((value) => !value)}
            >
              {drawer ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>
      </header>

      <MobileNav open={drawer} onClose={() => setDrawer(false)} account={mobileAccount} />
    </>
  );
}
