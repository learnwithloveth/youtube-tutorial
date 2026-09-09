'use client';

import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { useEscape, useScrollLock } from '@/shared/lib/hooks';
import { ButtonLink } from '@/shared/ui/primitives/button-link';

import { PRIMARY_NAV } from '../_lib/navigation';
import { ThemeToggle } from './theme-toggle';

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(0);
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
              {PRIMARY_NAV.map((column, index) => {
                const isOpen = expanded === index;
                return (
                  <li key={column.label}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : index)}
                      className="flex w-full items-center justify-between py-4 text-left"
                    >
                      <span className="font-display text-xl font-semibold">{column.label}</span>
                      <ChevronDown
                        className={cn(
                          'size-5 text-fg-subtle transition-transform duration-300',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="grid gap-1 pb-5">
                            {column.groups
                              ?.flatMap((group) => group.items)
                              .map((item) => (
                                <Link
                                  key={item.href + item.label}
                                  href={item.href}
                                  onClick={onClose}
                                  className="flex items-center gap-3 rounded-md px-2 py-2.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                                >
                                  <item.icon className="size-4 shrink-0 text-brand-soft" />
                                  <span className="text-sm">{item.label}</span>
                                </Link>
                              ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto grid gap-3">
              <ButtonLink href="/signup" size="lg" sheen onClick={onClose}>
                Create free account
              </ButtonLink>
              <div className="flex items-center gap-3">
                <ButtonLink
                  href="/login"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={onClose}
                >
                  Log in
                </ButtonLink>
                <ThemeToggle className="size-12" />
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
