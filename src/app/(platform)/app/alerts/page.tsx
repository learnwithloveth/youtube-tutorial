import type { Metadata } from 'next';
import { Bell, TriangleAlert } from 'lucide-react';

import { requireUser } from '@/server/auth';
import { getAlertsFor, getAlertableSymbols } from '@/server/alerts';
import { getNotifications } from '@/server/notifications';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { PageHeader } from '../../../_console/components/page-header';
import { AlertsPanel } from './_components/alerts-panel';
import { NotificationList } from './_components/notification-list';

/**
 * Price alerts and the notification feed.
 *
 * ── What the heading used to promise ──────────────────────────────────────────
 * "Push arrives in under 400 ms of the book crossing your level — not on the next
 * poll." It is the next poll. There is no live book feed in this system; prices
 * arrive when the market-data refresh runs, and that is the only moment an alert
 * can newly be satisfied — so it is exactly where the evaluation happens. The
 * heading now says so, and the stat tile that claimed "Median 380 ms to delivery"
 * is gone, because nothing measures delivery.
 *
 * ── The alerts are real and so is the feed ────────────────────────────────────
 * Each alert is an `alerts.price_alerts` row evaluated against live quotes on every
 * refresh. Each notification is an `activity.events` row — the same trail the
 * account history reads, so the bell and the history cannot disagree.
 *
 * ── There is no channel column ────────────────────────────────────────────────
 * The old table offered Push, Email and Both per alert. Push exists in this
 * codebase only for support chat and needs Firebase Authentication enabled, which
 * it is not; nothing mails a price alert. A per-alert dropdown choosing between
 * three channels, two of which do nothing, is a promise the customer relies on.
 * Alerts appear in the feed, which is what works.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alerts',
  robots: { index: false, follow: false },
};

export default async function AlertsPage() {
  const user = await requireUser('/app/alerts');

  const [board, feed, symbols] = await Promise.all([
    getAlertsFor(user.id),
    getNotifications(user.id, { limit: 8 }),
    getAlertableSymbols(),
  ]);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Set a level and we will tell you when a market reaches it. Checked every time fresh prices arrive."
      />

      {board.unavailable ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-bg-elev px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-fg-muted">
            Alerts are unavailable on this deployment.
          </p>
        </div>
      ) : null}

      {board.degraded || feed.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            {/* Said plainly: an empty page here would otherwise read as "you have
                no alerts", and somebody would set them up a second time. */}
            Your alerts could not be read just now. This is an empty page, not an
            empty list — anything you set is still watching.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Watching"
          value={String(board.armed)}
          delta={{ value: `${board.muted} muted`, direction: 'flat', period: '' }}
          icon={<Bell className="size-4" />}
        />
        <StatTile
          label="Fired, waiting to re-arm"
          value={String(board.triggered)}
          delta={{ value: 'Re-arm to watch again', direction: 'flat', period: '' }}
        />
        <StatTile
          label="Unread notifications"
          value={String(feed.unread)}
          delta={{ value: 'Opening the bell clears these', direction: 'flat', period: '' }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <AlertsPanel
          alerts={board.alerts}
          prices={board.prices}
          symbols={symbols}
          disabled={board.unavailable}
        />
        <NotificationList items={feed.items} total={feed.total} />
      </div>
    </>
  );
}
