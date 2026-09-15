import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, TriangleAlert } from 'lucide-react';

import type { ActivityKind } from '@/modules/activity';
import { requireUser } from '@/server/auth';
import { getNotifications, NOTIFIABLE, type NotificationDto } from '@/server/notifications';
import { cn } from '@/shared/lib/cn';
import { formatAge, formatTimestamp } from '@/shared/lib/format';

import { PageHeader, Panel } from '../../../_console/components/page-header';
import { TONE_DOT } from '../alerts/_components/notification-list';

/**
 * Everything that has happened on the account.
 *
 * ── Why this is a page and not a longer popover ───────────────────────────────
 * The bell answers "is there anything new" in a glance and is the wrong shape for
 * anything else: 320 pixels wide, closes when you look away, and truncates the
 * line that carries the actual figure. This is where somebody goes to read.
 *
 * ── Grouped by UTC day ────────────────────────────────────────────────────────
 * The grouping is done here, from timestamps the server already produced, and the
 * day is UTC — the same zone every other stamp in this application is pinned to.
 * Grouping by the reader's local day would put an event under a heading that
 * disagrees with the timestamp printed next to it.
 *
 * ── The filters are a narrowing, never a widening ─────────────────────────────
 * `getNotifications` intersects whatever it is given with its own notifiable set,
 * so a hand-edited `?kind=page-view` cannot surface a browsing history here.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

/** The filters offered, and which kinds each covers. */
const FILTERS: readonly { id: string; label: string; kinds: readonly ActivityKind[] }[] = [
  { id: 'all', label: 'Everything', kinds: NOTIFIABLE },
  {
    id: 'money',
    label: 'Money',
    kinds: ['deposit-recorded', 'deposit-rejected', 'withdrawal-requested', 'withdrawal-approved', 'withdrawal-rejected', 'receipt-sent'],
  },
  { id: 'alerts', label: 'Price alerts', kinds: ['price-alert-triggered'] },
  {
    id: 'security',
    label: 'Security',
    kinds: ['sign-in', 'password-reset', 'email-verified', 'verification-approved', 'verification-rejected'],
  },
];

export default async function NotificationsPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const user = await requireUser('/app/notifications');
  const params = await searchParams;

  const filter = FILTERS.find((entry) => entry.id === params.filter) ?? FILTERS[0]!;
  // Clamped, not trusted: `?page=-5` would otherwise become a negative offset and
  // `?page=1e9` a read the database has to count its way to.
  const page = Math.min(Math.max(Number(params.page ?? '1') || 1, 1), 200);

  const feed = await getNotifications(user.id, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    kinds: filter.kinds,
  });

  const days = groupByUtcDay(feed.items);
  const lastPage = Math.max(1, Math.ceil(feed.total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Every deposit, withdrawal, sign-in and fired alert on your account, newest first."
      />

      {feed.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            {/* An empty page here would read as "nothing has happened", and that is
                the opposite of what a failed read means. */}
            Your notifications could not be read just now. This is an empty page,
            not an empty history.
          </p>
        </div>
      ) : null}

      <nav aria-label="Filter notifications" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <Link
            key={entry.id}
            // Links, not buttons: a filter is a place, so it is shareable,
            // bookmarkable and survives a reload — and it needs no JavaScript.
            href={entry.id === 'all' ? '/app/notifications' : `/app/notifications?filter=${entry.id}`}
            aria-current={entry.id === filter.id ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              entry.id === filter.id
                ? 'border-brand-soft/50 bg-brand/12 text-brand-soft'
                : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {feed.items.length === 0 ? (
        <Panel>
          <div className="grid place-items-center gap-3 py-10 text-center">
            <Bell className="size-7 text-fg-subtle" />
            <p className="text-sm font-medium text-fg">
              {filter.id === 'all' ? 'Nothing yet' : `No ${filter.label.toLowerCase()} notifications`}
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-fg-subtle">
              {filter.id === 'alerts' ? (
                <>
                  Alerts appear here when a market reaches the level you set.{' '}
                  <Link href="/app/alerts" className="text-brand-soft hover:underline">
                    Set one up
                  </Link>
                  .
                </>
              ) : (
                'Deposits, withdrawals, sign-ins and fired alerts appear here.'
              )}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {days.map(([day, items]) => (
            <Panel key={day} padded={false} className="overflow-hidden">
              <p className="border-b border-line px-5 py-3 text-xs font-medium text-fg-muted">
                {day}
              </p>
              <ul className="divide-y divide-line/60">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-3 px-5 py-4">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        TONE_DOT[item.tone],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span
                          className={cn(
                            'text-sm',
                            item.unread ? 'font-medium text-fg' : 'text-fg-muted',
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="shrink-0 text-2xs text-fg-subtle">
                          {/* Both: the glance and the record. The relative label is
                              what a reader scans, and the stamp with its zone named
                              is what they quote in a support message. */}
                          {formatAge(item.ageSeconds)} · {formatTimestamp(item.occurredAt)}
                        </span>
                      </p>

                      {item.body === null ? null : (
                        // Not truncated here, unlike the bell: this is the page
                        // somebody opened to read the figure the popover cut off.
                        <p className="mt-1 break-words text-xs leading-relaxed text-fg-subtle">
                          {item.body}
                        </p>
                      )}

                      {item.reference === null ? null : (
                        <p
                          data-numeric
                          className="mt-1.5 break-all text-2xs text-fg-subtle/80"
                        >
                          {item.reference}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      {lastPage > 1 ? (
        <nav
          aria-label="Notification pages"
          className="mt-4 flex items-center justify-between gap-3"
        >
          <PageLink
            filter={filter.id}
            page={page - 1}
            disabled={page <= 1}
            label="Newer"
          />
          <span className="text-xs text-fg-subtle">
            Page {page} of {lastPage}
          </span>
          <PageLink
            filter={filter.id}
            page={page + 1}
            disabled={page >= lastPage}
            label="Older"
          />
        </nav>
      ) : null}
    </>
  );
}

function PageLink({
  filter,
  page,
  disabled,
  label,
}: {
  filter: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    // Rendered as text rather than a disabled link: an anchor with no href is not
    // focusable and announces nothing, and one that goes nowhere is worse.
    return <span className="text-xs text-fg-subtle/50">{label}</span>;
  }

  const query = new URLSearchParams();
  if (filter !== 'all') query.set('filter', filter);
  if (page > 1) query.set('page', String(page));
  const search = query.toString();

  return (
    <Link
      href={`/app/notifications${search ? `?${search}` : ''}`}
      className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      {label}
    </Link>
  );
}

/**
 * Buckets the feed into UTC days, preserving order.
 *
 * A positional reduce rather than a `Map` keyed on the day and re-sorted: the
 * events already arrive newest first, so walking them once keeps that order
 * without a second comparison that could disagree with it.
 */
function groupByUtcDay(items: readonly NotificationDto[]): [string, NotificationDto[]][] {
  const days: [string, NotificationDto[]][] = [];

  for (const item of items) {
    const key = dayLabel(item.occurredAt);
    const current = days[days.length - 1];
    if (current !== undefined && current[0] === key) current[1].push(item);
    else days.push([key, [item]]);
  }

  return days;
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function dayLabel(iso: string): string {
  return dayFormatter.format(new Date(iso));
}
