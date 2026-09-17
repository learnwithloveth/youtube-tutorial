'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';

import { ActiveLink } from '@/shared/ui/primitives/active-link';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownToLine, Bell, ChevronDown, LogOut, Menu, Search, Settings, ShieldCheck, User,
} from 'lucide-react';
import type { NotificationDto } from '@/server/notifications';
import { ThemeToggle } from '../../(marketing)/_components/theme-toggle';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { LogoMark } from '@/shared/ui/visuals/logo';
import { useEscape, useOutsideClick } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/cn';
import { formatAge } from '@/shared/lib/format';

import { signOutAction } from '../../(auth)/actions';
import { markNotificationsReadAction } from '../app/alerts/_lib/actions';
import { ResendVerification } from '../../_components/resend-verification';

const TONE_DOT: Record<NotificationDto['tone'], string> = {
  up: 'bg-up',
  down: 'bg-down',
  brand: 'bg-brand-soft',
  warn: 'bg-warn',
  neutral: 'bg-fg-subtle',
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
          /*
           * ── Anchored to the header on a phone, to its button above that ─────
           * Right-aligned to its trigger, a 320px panel only fits when the trigger
           * sits near the right edge. The bell does not: on a phone it is a button
           * or two in from the avatar, so the panel ran off the left of the screen.
           *
           * Below `sm` the trigger wrappers are not positioned, so this attaches to
           * the sticky header instead and spans it with a margin each side — the
           * width a phone has, whichever button opened it. From `sm` up the wrapper
           * is `relative` again and the panel sits under its button, sized by the
           * caller's `sm:w-*`.
           */
          className={cn(
            'absolute inset-x-3 top-full z-50 mt-2 overflow-hidden rounded-lg border border-line',
            'sm:inset-x-auto sm:right-0',
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
  notifications,
  unread,
  onOpenDrawer,
}: {
  /** Already resolved by the identity boundary — see `displayNameFor`. */
  name: string;
  initials: string;
  email: string;
  emailVerified: boolean;
  /**
   * Read on the server by the layout above.
   *
   * Passed down rather than fetched here: this bar renders on every page of the
   * application, and a client fetch would mean the badge arrives after paint —
   * a number that appears a moment later is one somebody has already looked past.
   */
  notifications: readonly NotificationDto[];
  unread: number;
  onOpenDrawer: () => void;
}) {
  const [bell, setBell] = useState(false);
  const [account, setAccount] = useState(false);

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

          <div className="sm:relative">
            <button
              type="button"
              id="notifications-button"
              aria-expanded={bell}
              aria-haspopup="dialog"
              onClick={() => {
                const opening = !bell;
                setBell(opening);
                // Marked read on open, not on render: a badge that clears because
                // a page loaded would clear on a page the customer never looked at.
                // Deliberately not awaited — the popover must paint now, and the
                // badge is server-rendered on the next navigation.
                if (opening && unread > 0) void markNotificationsReadAction();
              }}
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

            <Popover open={bell} onClose={closeBell} labelledBy="notifications-button" className="sm:w-80">
              <p className="border-b border-line px-4 py-3 text-sm font-medium text-fg">Notifications</p>
              <ul className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <li className="px-4 py-8 text-center text-xs text-fg-subtle">
                    Nothing yet. Deposits, withdrawals, sign-ins and fired alerts
                    appear here.
                  </li>
                ) : (
                  notifications.map((note) => (
                    <li
                      key={note.id}
                      className="flex gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                    >
                      <span
                        aria-hidden
                        className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT[note.tone])}
                      />
                      {/* A list item, not a button. The old one was clickable and
                          did nothing — there is nowhere for most of these to go,
                          and a control that does not act is worse than plain text
                          for anybody navigating by keyboard. */}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn('truncate text-sm', note.unread ? 'font-medium text-fg' : 'text-fg-muted')}>
                            {note.title}
                          </span>
                          {/* The server measured this duration — see
                              `NotificationDto.ageSeconds`. Reading the clock
                              here would fail hydration. */}
                          <span className="shrink-0 text-2xs text-fg-subtle">
                            {formatAge(note.ageSeconds)}
                          </span>
                        </span>
                        {note.body === null ? null : (
                          <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                            {note.body}
                          </span>
                        )}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              {/* Two destinations, because they are two different things: the
                  whole feed, and the alerts that put things in it. The single
                  "Manage alerts" link sent everybody to the wrong one. */}
              <div className="grid grid-cols-2 border-t border-line">
                <ActiveLink
                  href="/app/notifications"
                  onClick={closeBell}
                  className="border-r border-line px-4 py-2.5 text-center text-xs font-medium text-brand-soft hover:bg-surface"
                >
                  See all
                </ActiveLink>
                <ActiveLink
                  href="/app/alerts"
                  onClick={closeBell}
                  className="px-4 py-2.5 text-center text-xs font-medium text-fg-muted hover:bg-surface hover:text-fg"
                >
                  Manage alerts
                </ActiveLink>
              </div>
            </Popover>
          </div>

          <div className="sm:relative">
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

            <Popover open={account} onClose={closeAccount} labelledBy="account-button" className="sm:w-64">
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
                  // Sends the link, rather than linking to the page that consumes
                  // one. As a link this went to `/verify-email` with no token,
                  // which could only answer "That link did not work".
                  <ResendVerification
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warn/40 px-2 py-0.5 text-2xs text-warn hover:bg-warn/10"
                    messageClassName="mt-1.5 block text-2xs"
                    pendingLabel="Sending the link…"
                  >
                    <ShieldCheck className="size-3" />
                    Confirm your email
                  </ResendVerification>
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
                {/* A form posting the sign-out action, looking exactly as the link did.
                    It was a link to /login, which ends nothing: the session survived
                    the click — so did this browser's push registration — and on a
                    shared machine the next person was still in the account. */}
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </form>
              </div>
            </Popover>
          </div>
        </div>
      </div>
    </header>
  );
}
