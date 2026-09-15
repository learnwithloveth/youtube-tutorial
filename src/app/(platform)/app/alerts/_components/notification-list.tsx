import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import type { NotificationDto } from '@/server/notifications';
import { cn } from '@/shared/lib/cn';
import { formatAge } from '@/shared/lib/format';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';

/**
 * A short preview of the feed, beside the alerts.
 *
 * The full list lives at `/app/notifications`; this is the glance. A Server
 * Component, because nothing here is interactive — it costs no JavaScript and
 * arrives in the HTML.
 */

export const TONE_DOT: Record<NotificationDto['tone'], string> = {
  up: 'bg-up',
  down: 'bg-down',
  warn: 'bg-warn',
  brand: 'bg-brand-soft',
  neutral: 'bg-fg-subtle',
};

export function NotificationList({
  items,
  total,
}: {
  items: readonly NotificationDto[];
  total: number;
}) {
  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <PanelHeader
          title="Recent notifications"
          subtitle={total > items.length ? `Newest ${items.length} of ${total}` : undefined}
        />
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-xs text-fg-subtle">
          Nothing yet. Deposits, withdrawals, sign-ins and fired alerts appear here.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 px-5 py-3">
              <span
                aria-hidden
                className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT[item.tone])}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      'truncate text-sm',
                      item.unread ? 'font-medium text-fg' : 'text-fg-muted',
                    )}
                  >
                    {item.title}
                  </span>
                  {/* The server measured this duration — see `ageSeconds`. Reading
                      the clock in a component would fail hydration. */}
                  <span className="shrink-0 text-2xs text-fg-subtle">
                    {formatAge(item.ageSeconds)}
                  </span>
                </p>
                {item.body === null ? null : (
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">{item.body}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/app/notifications"
        className="flex items-center justify-center gap-1.5 border-t border-line px-5 py-3 text-xs font-medium text-brand-soft transition-colors hover:bg-surface"
      >
        All notifications
        <ArrowRight className="size-3.5" />
      </Link>
    </Panel>
  );
}
