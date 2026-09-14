'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';

import { ActiveLink } from '@/shared/ui/primitives/active-link';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownToLine, Bell, ChevronDown, LogOut, Menu, Search, Settings, ShieldCheck, User,
} from 'lucide-react';
import { NOTIFICATIONS } from '../_data/data';
import { ThemeToggle } from '../../(marketing)/_components/theme-toggle';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { LogoMark } from '@/shared/ui/visuals/logo';
import { useEscape, useOutsideClick } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/cn';

const TONE_DOT: Record<string, string> = {
  up: 'bg-up',
  brand: 'bg-brand-soft',
  accent: 'bg-accent',
  warn: 'bg-warn',
};

function Popover({
  open, onClose, children, className, labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, open);
  useEscape(onClose, open);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          role="dialog"
          aria-labelledby={labelledBy}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-line',
            'bg-bg-elev/98 shadow-float backdrop-blur-2xl',
            className,
          )}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function TopBar({
  name,
  initials,
  email,
  emailVerified,
  onOpenDrawer,
}: {
  /** Already resolved by the identity boundary — see `displayNameFor`. */
  name: string;
  initials: string;
  email: string;
  emailVerified: boolean;
  onOpenDrawer: () => void;
}) {
  const [bell, setBell] = useState(false);
  const [account, setAccount] = useState(false);
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  const closeBell = useCallback(() => setBell(false), []);
  const closeAccount = useCallback(() => setAccount(false), []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="grid size-9 shrink-0 place-items-center rounded-sm border border-line text-fg-muted transition-colors hover:text-fg lg:hidden"
        >
          <Menu className="size-4" />
        </button>
        <Link href="/app" className="lg:hidden" aria-label="Novex dashboard">
          <LogoMark className="size-8" />
        </Link>

        <label className="relative hidden max-w-sm flex-1 md:block">
          <span className="sr-only">Search markets, transactions and settings</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            placeholder="Search markets, transactions…"
            className="h-9 w-full rounded-full border border-line bg-surface pl-10 pr-16 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-xs border border-line px-1.5 py-0.5 font-mono text-2xs text-fg-subtle">
            ⌘K
          </kbd>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/app/wallet" size="sm" className="hidden sm:inline-flex">
            <ArrowDownToLine className="size-3.5" />
            Deposit
          </ButtonLink>

          <ThemeToggle className="size-9" />

          <div className="relative">
            <button
              type="button"
              id="notifications-button"
              aria-expanded={bell}
              aria-haspopup="dialog"
              onClick={() => setBell((v) => !v)}
              className="relative grid size-9 place-items-center rounded-full border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <Bell className="size-4" />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-brand text-[9px] font-semibold text-on-brand">
                  {unread}
                </span>
              ) : null}
              <span className="sr-only">
                Notifications{unread > 0 ? `, ${unread} unread` : ''}
              </span>
            </button>

            <Popover open={bell} onClose={closeBell} labelledBy="notifications-button" className="w-80">
              <p className="border-b border-line px-4 py-3 text-sm font-medium text-fg">Notifications</p>
              <ul className="max-h-80 overflow-y-auto">
                {NOTIFICATIONS.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      className="flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface"
                    >
                      <span
                        aria-hidden
                        className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT[note.tone])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn('truncate text-sm', note.unread ? 'font-medium text-fg' : 'text-fg-muted')}>
                            {note.title}
                          </span>
                          <span className="shrink-0 text-2xs text-fg-subtle">{note.time}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-fg-subtle">{note.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <ActiveLink
                href="/app/alerts"
                onClick={closeBell}
                className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-brand-soft hover:bg-surface"
              >
                Manage alerts
              </ActiveLink>
            </Popover>
          </div>

          <div className="relative">
            <button
              type="button"
              id="account-button"
              aria-expanded={account}
              aria-haspopup="dialog"
              onClick={() => setAccount((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2 transition-colors hover:border-line-strong"
            >
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-full bg-brand/20 text-xs font-semibold text-brand-soft"
              >
                {initials}
              </span>
              <ChevronDown className={cn('size-3.5 text-fg-subtle transition-transform', account && 'rotate-180')} />
              <span className="sr-only">Account menu for {name}</span>
            </button>

            <Popover open={account} onClose={closeAccount} labelledBy="account-button" className="w-64">
              <div className="border-b border-line px-4 py-3.5">
                {/* All three lines are the signed-in account now. This menu used to
                    show a demo persona's name and a "Verified · Gold" badge above
                    the one real value on it. */}
                <p className="truncate text-sm font-medium text-fg">{name}</p>
                <p className="truncate text-xs text-fg-subtle">{email}</p>
                {emailVerified ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-2xs text-up">
                    <ShieldCheck className="size-3" />
                    Email confirmed
                  </p>
                ) : (
                  <Link
                    href="/verify-email"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warn/40 px-2 py-0.5 text-2xs text-warn"
                  >
                    <ShieldCheck className="size-3" />
                    Confirm your email
                  </Link>
                )}
              </div>
              <ul className="p-1.5">
                {[
                  { label: 'Profile', href: '/app/settings', icon: User },
                  { label: 'Security', href: '/app/settings', icon: ShieldCheck },
                  { label: 'Preferences', href: '/app/settings', icon: Settings },
                ].map((item) => (
                  <li key={item.label}>
                    <ActiveLink
                      href={item.href}
                      onClick={closeAccount}
                      className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </ActiveLink>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line p-1.5">
                <ActiveLink
                  href="/login"
                  onClick={closeAccount}
                  className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  <LogOut className="size-4" />
                  Sign out
                </ActiveLink>
              </div>
            </Popover>
          </div>
        </div>
      </div>
    </header>
  );
}
