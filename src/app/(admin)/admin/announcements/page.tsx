import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';

import { requireAdmin } from '@/server/auth';
import { getAnnouncementConsole } from '@/server/announcements';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { AdminPageHeader, EmptyState } from '../../_components/admin-ui';
import { AnnouncementsBoard } from './_components/announcements-board';

/**
 * Announcements.
 *
 * ── Publishing now reaches a customer ─────────────────────────────────────────
 * The screen this replaced wrote to an in-memory reducer: "Publish" moved a badge
 * and a reload undid it, and the tile headed "Live on customer surfaces" counted
 * fixtures against no surface at all. Every notice here is an
 * `announcements.announcements` row, and the site banner, the app shell and
 * `/status` each read it back on render.
 *
 * ── What went with the fixtures ───────────────────────────────────────────────
 * "Banner impressions — 4.1M, +12% this week" is gone. Nothing counts an
 * impression in this system, and a number that large on an operations screen is
 * read as a measurement. The fourth tile is the one figure worth knowing instead:
 * how many notices are actually in front of customers right now.
 *
 * The "Email" surface is gone too, and `domain/announcement.ts` explains why at
 * the point where somebody would add it back — mailing every customer needs an
 * unsubscribe mechanism, a queue and a throttle, none of which exist.
 *
 * ── Scheduling needs no scheduler ─────────────────────────────────────────────
 * A notice is live when its `publishAt` has passed, worked out on every read. So a
 * scheduled one appears at its moment whether or not any job ran — see
 * `Announcement.isLiveAt`. The board shows the stored status *and* whether a
 * customer can see it, because those differ for exactly the minutes that matter.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Announcements',
  robots: { index: false, follow: false },
};

export default async function AnnouncementsPage() {
  await requireAdmin('/admin/announcements');
  const board = await getAnnouncementConsole();

  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="What customers see on the site banner, inside the app and on the status page. Publishing is immediate."
      />

      {board.unavailable ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-bg-elev px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-fg-muted">
            No database is configured on this deployment, so nothing can be published.
          </p>
        </div>
      ) : null}

      {board.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            Announcements could not be read. This is an empty page, not an empty
            board — anything already published is still on the site.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Live now"
          value={String(board.live)}
          delta={{ value: 'In front of customers', direction: 'flat', period: '' }}
        />
        <StatTile
          label="Scheduled"
          value={String(board.scheduled)}
          delta={{ value: 'Appear on their own', direction: 'flat', period: '' }}
        />
        <StatTile
          label="Drafts"
          value={String(board.drafts)}
          delta={{ value: 'Nobody can see these', direction: 'flat', period: '' }}
        />
        <StatTile
          label="Written"
          value={String(board.items.length)}
          delta={{ value: 'Excluding archived', direction: 'flat', period: '' }}
        />
      </div>

      <AnnouncementsBoard
        items={board.items}
        authors={board.authors}
        disabled={board.unavailable}
      />

      {board.items.length === 0 && !board.unavailable ? (
        <EmptyState
          title="Nothing written yet"
          body="Compose one above. A draft is invisible until you publish or schedule it."
        />
      ) : null}
    </>
  );
}
