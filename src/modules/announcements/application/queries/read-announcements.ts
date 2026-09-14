import { logger } from '@/platform/observability/logger';

import type {
  Announcement,
  AnnouncementStatus,
  AnnouncementSurface,
  AnnouncementTone,
} from '../../domain/announcement';
import type { AnnouncementDependencies } from '../ports';

/**
 * Reads for the console and for the customer surfaces.
 *
 * ── `live` is derived, never stored ───────────────────────────────────────────
 * A scheduled notice whose moment has arrived *is* live, and no job had to run for
 * that to be true. The console shows both the stored status — what an operator
 * chose — and the derived one, because "Scheduled" beside a notice that is already
 * on the site would be the screen lying about the site.
 */

export interface AnnouncementDto {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly surface: AnnouncementSurface;
  readonly tone: AnnouncementTone;
  /** What the operator chose. */
  readonly status: AnnouncementStatus;
  /** Whether a customer can see it right now. */
  readonly live: boolean;
  readonly publishAt: string | null;
  readonly expiresAt: string | null;
  readonly authorId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AnnouncementBoardDto {
  readonly items: readonly AnnouncementDto[];
  readonly live: number;
  readonly scheduled: number;
  readonly drafts: number;
  /** True when the read failed — an empty board is not the same as none written. */
  readonly degraded: boolean;
}

export async function getAnnouncementBoard(
  deps: AnnouncementDependencies,
  options: { limit?: number } = {},
): Promise<AnnouncementBoardDto> {
  const now = deps.clock.now();

  try {
    const rows = await deps.announcements.listForConsole(options.limit ?? 100);
    const items = rows.map((row) => toDto(row, now));

    return {
      items,
      live: items.filter((item) => item.live).length,
      // Chosen-and-not-yet-arrived, which is what an operator means by "scheduled".
      // One whose moment has passed is counted as live above, in both places.
      scheduled: items.filter((item) => item.status === 'scheduled' && !item.live).length,
      drafts: items.filter((item) => item.status === 'draft').length,
      degraded: false,
    };
  } catch (error) {
    logger.error({ event: 'announcement_board_read_failed', module: 'announcements' }, error);
    return { items: [], live: 0, scheduled: 0, drafts: 0, degraded: true };
  }
}

/**
 * What customers actually see on one surface.
 *
 * ── It degrades to silence, deliberately ──────────────────────────────────────
 * This runs in a layout, on every page of the site. A notice that cannot be read is
 * a notice nobody sees, which is exactly what was happening a moment before it was
 * written — whereas a layout that throws takes the whole page with it. The console
 * is where a failure to *read* announcements has to be visible, and it is.
 */
export async function getLiveAnnouncements(
  deps: AnnouncementDependencies,
  surface: AnnouncementSurface,
  limit = 3,
): Promise<readonly AnnouncementDto[]> {
  const now = deps.clock.now();

  try {
    const rows = await deps.announcements.listLive(surface, now, limit);
    // Re-checked against the aggregate rather than trusted from the query: the SQL
    // window is an index optimisation, and `isLiveAt` is the rule.
    return rows.filter((row) => row.isLiveAt(now)).map((row) => toDto(row, now));
  } catch (error) {
    logger.warn(
      { event: 'live_announcements_read_failed', module: 'announcements', surface },
      error,
    );
    return [];
  }
}

function toDto(announcement: Announcement, now: Date): AnnouncementDto {
  const snapshot = announcement.snapshot();
  return {
    id: snapshot.id,
    title: snapshot.title,
    body: snapshot.body,
    surface: snapshot.surface,
    tone: snapshot.tone,
    status: snapshot.status,
    live: announcement.isLiveAt(now),
    publishAt: snapshot.publishAt?.toISOString() ?? null,
    expiresAt: snapshot.expiresAt?.toISOString() ?? null,
    authorId: snapshot.authorId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
