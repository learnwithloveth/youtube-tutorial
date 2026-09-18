'use client';

import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useEscape, useScrollLock } from '@/shared/lib/hooks';

import { SECTION_NAV } from '../_lib/navigation';

/**
 * `account` is a slot, not an import — the same arrangement `Navbar` uses and for
 * the same reason. This component is interactive, so it is a Client Component; the
 * account block needs the session, which only the server can read.
 *
 * The slot's links carry no `onClose`, and do not need one: `Navbar` closes the
 * drawer when the pathname changes, so navigating from inside it already shuts it.
 * The section links do carry one, because a jump to `/#earn` from the home page
 * changes no pathname — and the drawer would otherwise stay over the section it
 * just scrolled to. Closing also releases the scroll lock, which is what lets the
 * browser move to the anchor at all.
 */
export function MobileNav({
  open,
  onClose,
  account,
}: {
  open: boolean;
  onClose: () => void;
  account: ReactNode;
}) {
  useScrollLock(open);
  useEscape(onClose, open);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="drawer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 bottom-0 top-18 z-40 overflow-y-auto bg-bg/96 backdrop-blur-2xl lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
        >
          <div className="shell flex min-h-full flex-col gap-6 py-8">
            <ul className="divide-y divide-line border-y border-line">
              {SECTION_NAV.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className="flex items-center justify-between py-4 text-fg transition-colors duration-200 hover:text-brand-soft"
                  >
                    <span className="font-display text-xl font-semibold">{link.label}</span>
                    <ChevronRight className="size-5 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid gap-3">{account}</div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
