'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellOff, BellRing, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { AdminFeedDto, AdminFeedItemDto } from '@/server/admin-alerts';
import { usePush, usePushMessages } from '@/shared/firebase/use-push';
import { cn } from '@/shared/lib/cn';
import { formatAge } from '@/shared/lib/format';
import { useEscape, useOutsideClick } from '@/shared/lib/hooks';

/**
 * The console's customer-activity alerts: a bell in the top bar and a pop-up on
 * whichever admin page is open.
 *
 * ── Polled, and hurried along by push ───────────────────────────────────────────
 * The feed is asked for every fifteen seconds while the tab is visible. When a push
 * notification reaches this browser the service worker says so, and the feed is
 * asked at once — so an operator who switched push on sees the pop-up with the
 * system notification, and one who did not still sees it within a poll.
 *
 * ── What counts as new ──────────────────────────────────────────────────────────
 * Only what arrives while the console is open pops up; whatever happened before it
 * loaded is already in the bell, counted as unread. "Read" is kept per browser —
 * the moment the bell was last opened here — because it is a question about what
 * this operator has looked at on this screen, not a fact about the platform.
 */

const POLL_MS = 15_000;
/** A support message is pushed a moment before it is on the trail; look again. */
const SECOND_LOOK_MS = 3_000;
const READ_KEY = 'novex.admin.feed.read-at';
const TOAST_MS = 7_000;
const MAX_TOASTS = 3;

const TONE_DOT: Record<AdminFeedItemDto['tone'], string> = {
  up: 'bg-up',
  down: 'bg-down',
  brand: 'bg-brand-soft',
  warn: 'bg-warn',
  neutral: 'bg-fg-subtle',
};

/* The moment the bell was last opened in this browser, as an external store. */
const readAtListeners = new Set<() => void>();

function subscribeToReadAt(listener: () => void): () => void {
  readAtListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    readAtListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readAtFromStorage(): number {
  try {
    return Number(window.localStorage.getItem(READ_KEY)) || 0;
  } catch {
    // Storage refused: everything counts as unread, which is the safe way round.
    return 0;
  }
}

function readAtOnServer(): number | null {
  return null;
}

export interface AdminFeed {
  readonly items: readonly AdminFeedItemDto[];
  readonly unread: number;
  readonly toasts: readonly AdminFeedItemDto[];
  readonly dismiss: (id: string) => void;
  readonly markRead: () => void;
}

export function useAdminFeed(initial: AdminFeedDto): AdminFeed {
  const [items, setItems] = useState<readonly AdminFeedItemDto[]>(initial.items);
  const [toasts, setToasts] = useState<readonly AdminFeedItemDto[]>([]);
  // Null on the server and through hydration, the stored moment afterwards: the
  // server cannot see storage, and a badge rendered from a guess would differ
  // between the two renders. Another tab opening its bell updates this one too.
  const readAt = useSyncExternalStore(subscribeToReadAt, readAtFromStorage, readAtOnServer);
  const known = useRef(new Set(initial.items.map((item) => item.id)));

  const poll = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!response.ok) return;
      const feed = (await response.json()) as AdminFeedDto;
      // A failed read keeps what is on screen: an empty bell would say nothing
      // happened, which is not what a failed read means.
      if (feed.degraded) return;

      const fresh = feed.items.filter((item) => !known.current.has(item.id));
      for (const item of feed.items) known.current.add(item.id);

      setItems(feed.items);
      if (fresh.length > 0) {
        setToasts((current) => [...fresh, ...current].slice(0, MAX_TOASTS));
      }
    } catch {
      // Offline, or the server restarting. The next tick asks again.
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    const interval = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [poll]);

  const followUp = useRef<number | null>(null);
  const onPush = useCallback(() => {
    void poll();
    if (followUp.current !== null) window.clearTimeout(followUp.current);
    followUp.current = window.setTimeout(() => void poll(), SECOND_LOOK_MS);
  }, [poll]);
  useEffect(
    () => () => {
      if (followUp.current !== null) window.clearTimeout(followUp.current);
    },
    [],
  );
  usePushMessages(onPush);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const markRead = useCallback(() => {
    try {
      window.localStorage.setItem(READ_KEY, String(Date.now()));
    } catch {
      // Unread again on the next visit, which is harmless.
    }
    for (const listener of readAtListeners) listener();
  }, []);

  const unread =
    readAt === null ? 0 : items.filter((item) => Date.parse(item.occurredAt) > readAt).length;

  return { items, unread, toasts, dismiss, markRead };
}

export function AdminNotificationBell({
  feed,
  operatorId,
}: {
  feed: AdminFeed;
  operatorId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, close, open);
  useEscape(close, open);

  return (
    // Not positioned on a phone, so the panel anchors to the sticky header and spans
    // it — the same arrangement as the customer top bar, for the same reason: a
    // panel right-aligned to a button that is not at the edge runs off the screen.
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        id="admin-notifications-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const opening = !open;
          setOpen(opening);
          if (opening) feed.markRead();
        }}
        className="relative grid size-9 place-items-center rounded-full border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        <Bell className="size-4" />
        {feed.unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-semibold text-on-brand">
            {feed.unread > 9 ? '9+' : feed.unread}
          </span>
        ) : null}
        <span className="sr-only">
          Customer activity{feed.unread > 0 ? `, ${feed.unread} unread` : ''}
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-labelledby="admin-notifications-button"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-3 top-full z-50 mt-2 overflow-hidden rounded-lg border border-line bg-bg-elev/98 shadow-float backdrop-blur-2xl sm:inset-x-auto sm:right-0 sm:w-88"
          >
            <p className="border-b border-line px-4 py-3 text-sm font-medium text-fg">
              Customer activity
            </p>
            <ul className="max-h-96 overflow-y-auto">
              {feed.items.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs leading-relaxed text-fg-subtle">
                  Nothing yet. Customers arriving, support messages, sign-ins,
                  deposits and withdrawals appear here.
                </li>
              ) : (
                feed.items.map((item) => (
                  <li key={item.id} className="border-b border-line/60 last:border-0">
                    <Link
                      href={item.link}
                      onClick={close}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface"
                    >
                      <span
                        aria-hidden
                        className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT[item.tone])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-fg">{item.title}</span>
                          {/* Measured on the server — reading the clock here would
                              fail hydration. */}
                          <span className="shrink-0 text-2xs text-fg-subtle">
                            {formatAge(item.ageSeconds)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                          {item.body}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
            <PushFooter operatorId={operatorId} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The switch for system notifications, where an operator is looking at alerts.
 *
 * The only other one is on the support console, which an operator who never works
 * the queue would never find.
 */
function PushFooter({ operatorId }: { operatorId: string }) {
  const { state, error, enable } = usePush(operatorId);
  if (state === 'unconfigured' || state === 'unsupported') return null;

  return (
    <div className="border-t border-line px-4 py-2.5 text-2xs text-fg-subtle">
      {state === 'granted' ? (
        <span className="inline-flex items-center gap-1.5 text-up">
          <BellRing className="size-3" />
          System notifications are on for this browser
        </span>
      ) : state === 'denied' ? (
        <span className="inline-flex items-center gap-1.5">
          <BellOff className="size-3" />
          Notifications are blocked in this browser’s site settings
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={state === 'working'}
          className="inline-flex items-center gap-1.5 font-medium text-brand-soft transition-colors hover:text-fg disabled:opacity-40"
        >
          {state === 'working' ? <Loader2 className="size-3 animate-spin" /> : <Bell className="size-3" />}
          Also send these as system notifications
        </button>
      )}
      {error !== null ? (
        <p role="alert" className="mt-1.5 leading-relaxed text-down">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The pop-ups, on whichever admin page is open. */
export function AdminToasts({ feed }: { feed: AdminFeed }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-60 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {feed.toasts.map((item) => (
          <Toast key={item.id} item={item} onDismiss={feed.dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({ item, onDismiss }: { item: AdminFeedItemDto; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto relative overflow-hidden rounded-lg border border-line bg-bg-elev shadow-float"
    >
      <Link
        href={item.link}
        onClick={() => onDismiss(item.id)}
        className="flex gap-3 py-3 pl-4 pr-10 transition-colors hover:bg-surface"
      >
        <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[item.tone])} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg">{item.title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{item.body}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}
