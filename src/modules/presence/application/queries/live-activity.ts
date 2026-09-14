import { logger } from '@/platform/observability/logger';
import type { Clock } from '@/shared/kernel';

import { IDLE_WINDOW_MS } from '../../domain/presence';
import {
  toActiveVisitorDto,
  type ActiveVisitorDto,
  type CountryPresenceDto,
  type LiveActivityDto,
  type PagePresenceDto,
} from '../dto';
import type { PresenceRepository } from '../ports';

/**
 * Who is on the site right now, and where.
 *
 * ── It degrades rather than propagating ─────────────────────────────────────────
 * A failed read returns an empty board flagged `degraded`, not an exception. The
 * console is what an operator opens when something is wrong, and a live-traffic
 * panel that throws would take the whole page down — including the queues and the
 * audit log, which have nothing to do with presence and are the reason they opened
 * it. The flag is there so an empty board because nobody is browsing and an empty
 * board because the database is unreachable do not look the same.
 */

export interface LiveActivityOptions {
  /**
   * Most visitors to return.
   *
   * A cap rather than pagination: this feeds a live board that is re-read every
   * few seconds, and a cursor that moves under a refresh would be worse than a
   * truncated list. The aggregates below are computed over the same capped set, so
   * they describe what is shown rather than claiming to describe everything.
   */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export async function listLiveActivity(
  deps: { presences: PresenceRepository; clock: Clock },
  options: LiveActivityOptions = {},
): Promise<LiveActivityDto> {
  const now = deps.clock.now();
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Anything quieter than the idle window is `gone` by the domain's own rule, so
  // asking the database for it would be asking for rows that get filtered out.
  const since = new Date(now.getTime() - IDLE_WINDOW_MS);

  let visitors: ActiveVisitorDto[];
  try {
    const rows = await deps.presences.listSince(since, limit);
    visitors = rows
      .map((presence) => toActiveVisitorDto(presence, deps.clock))
      .filter((dto): dto is ActiveVisitorDto => dto !== null);
  } catch (error) {
    logger.error({ event: 'live_activity_read_failed', module: 'presence' }, error);
    return {
      visitors: [],
      pages: [],
      countries: [],
      totals: { active: 0, idle: 0, signedIn: 0, anonymous: 0, located: 0, unlocated: 0 },
      observedAt: now.toISOString(),
      degraded: true,
    };
  }

  return {
    visitors,
    pages: groupByPage(visitors),
    countries: groupByCountry(visitors),
    totals: {
      active: visitors.filter((v) => v.activity === 'active').length,
      idle: visitors.filter((v) => v.activity === 'idle').length,
      signedIn: visitors.filter((v) => v.userId !== null).length,
      anonymous: visitors.filter((v) => v.userId === null).length,
      located: visitors.filter((v) => v.location !== null).length,
      unlocated: visitors.filter((v) => v.location === null).length,
    },
    observedAt: now.toISOString(),
    degraded: false,
  };
}

function groupByPage(visitors: readonly ActiveVisitorDto[]): PagePresenceDto[] {
  const counts = new Map<string, { active: number; idle: number }>();

  for (const visitor of visitors) {
    const entry = counts.get(visitor.path) ?? { active: 0, idle: 0 };
    entry[visitor.activity] += 1;
    counts.set(visitor.path, entry);
  }

  return [...counts.entries()]
    .map(([path, entry]) => ({
      path,
      active: entry.active,
      idle: entry.idle,
      total: entry.active + entry.idle,
    }))
    .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path));
}

/**
 * Counts by country, with the unlocated kept as their own bucket.
 *
 * Dropping them would let the panel read as "everyone is in these six countries"
 * when a third of the board has no location at all. The null bucket sorts last but
 * is never hidden.
 */
function groupByCountry(visitors: readonly ActiveVisitorDto[]): CountryPresenceDto[] {
  const counts = new Map<string | null, number>();

  for (const visitor of visitors) {
    const country = visitor.location?.country ?? null;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([country, total]) => ({ country, total }))
    .sort((a, b) => {
      if (a.country === null) return 1;
      if (b.country === null) return -1;
      return b.total - a.total || a.country.localeCompare(b.country);
    });
}
