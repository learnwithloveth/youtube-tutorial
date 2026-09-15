import 'server-only';

import { cache } from 'react';

import type {
  AnnouncementBoardDto,
  AnnouncementDto,
  AnnouncementSurface,
} from '@/modules/announcements';
import {
  getAnnouncementBoard,
  getLiveAnnouncements,
  registerAnnouncements,
  type AnnouncementsModule,
} from '@/modules/announcements/server';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { identity } from './auth';

/**
 * The application's announcements facade.
 *
 * ── Null when there is no database ────────────────────────────────────────────
 * Same shape as `ledger()`. A deployment without `DATABASE_URL` still boots, and
 * the console says the feature is unavailable rather than rendering an error
 * boundary over a page nobody could have used anyway.
 */
export const announcements = cache((): AnnouncementsModule | null => {
  const database = db();
  if (database === null) return null;
  return registerAnnouncements({ db: database });
});

export interface AnnouncementConsoleDto extends AnnouncementBoardDto {
  /** Author email per id, for whichever resolved. */
  readonly authors: Readonly<Record<string, string>>;
  readonly unavailable: boolean;
}

const UNAVAILABLE: AnnouncementConsoleDto = {
  items: [],
  live: 0,
  scheduled: 0,
  drafts: 0,
  degraded: false,
  authors: {},
  unavailable: true,
};

export const getAnnouncementConsole = cache(async (): Promise<AnnouncementConsoleDto> => {
  const context = announcements();
  if (context === null) return UNAVAILABLE;

  const board = await getAnnouncementBoard(context.dependencies);
  const ids = [...new Set(board.items.map((item) => item.authorId))];

  return { ...board, authors: await describeAuthors(ids), unavailable: false };
});

/**
 * What customers see on one surface.
 *
 * ── Deduplicated per request, and cheap by design ─────────────────────────────
 * This runs in a layout, so it is on the path of every page render. `cache` keeps
 * a layout and a page asking for the same surface to one query, and the index on
 * `(surface, status, publish_at)` keeps that query to a handful of rows.
 */
export const getSurfaceAnnouncements = cache(
  async (surface: AnnouncementSurface): Promise<readonly AnnouncementDto[]> => {
    const context = announcements();
    if (context === null) return [];
    return getLiveAnnouncements(context.dependencies, surface);
  },
);

async function describeAuthors(ids: readonly string[]): Promise<Record<string, string>> {
  const parsed = ids.flatMap((id) => {
    try {
      return [toUserId(id)];
    } catch {
      return [];
    }
  }) as UserId[];

  if (parsed.length === 0) return {};

  try {
    const found = await identity().describeUsers(parsed);
    return Object.fromEntries([...found.values()].map((user) => [user.id, user.email]));
  } catch (error) {
    // The id renders instead. An operator can act on an id; a board that refuses
    // to load because one address was missing is worse than one showing a uuid.
    logger.warn({ event: 'announcement_authors_read_failed', module: 'identity' }, error);
    return {};
  }
}
