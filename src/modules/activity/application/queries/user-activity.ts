import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { ActivityEvent, ActivityKind } from '../../domain/event';
import {
  toActivityEventDto,
  type KnownDeviceDto,
  type UserActivityDto,
} from '../dto';
import type { ActivityRepository } from '../ports';

/**
 * Everything one account has done, assembled for the console's user page.
 *
 * ── It degrades rather than propagating ─────────────────────────────────────────
 * A failed read returns an empty history flagged `degraded`, not an exception. The
 * account page also shows who the person is, whether they are frozen and what
 * their balance is — none of which depends on the audit trail — and a history
 * panel that threw would take the whole page down with it.
 */

export interface UserActivityOptions {
  readonly kinds?: readonly ActivityKind[] | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const TOP_PATHS = 8;

const EMPTY: UserActivityDto = {
  tallies: [],
  topPaths: [],
  devices: [],
  recent: { events: [], total: 0, limit: DEFAULT_LIMIT, offset: 0 },
  degraded: true,
};

export async function getUserActivity(
  events: ActivityRepository,
  userId: UserId,
  options: UserActivityOptions = {},
): Promise<UserActivityDto> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);

  // ── Why `allSettled` and not `all` ──────────────────────────────────────────
  // These five reads are issued together because they are independent and hit the
  // same index; in sequence the page would wait for the sum rather than the
  // slowest. But `Promise.all` rejects on the first failure and leaves the other
  // four rejections unattached — and an unhandled rejection terminates the Node
  // process by default. Since the realistic failure is "the database is
  // unreachable", in which case *all five* fail, the obvious version turns a
  // degraded panel into a crashed server.
  //
  // `allSettled` attaches a handler to every one of them, and has the better
  // property besides: a failure in the route ranking costs the route ranking
  // rather than the whole page.
  const [page, total, tallies, topPaths, signIns] = await Promise.allSettled([
    events.listForUser({ userId, kinds: options.kinds, limit, offset }),
    events.countForUser(userId, options.kinds),
    events.summariseUser(userId),
    events.topPathsForUser(userId, TOP_PATHS),
    events.listForUser({ userId, kinds: ['sign-in', 'sign-up'], limit: 200, offset: 0 }),
  ]);

  // The timeline is the page. Losing a panel is a degraded panel; losing this is a
  // history we cannot show, and saying so is the whole point of the flag.
  if (page.status === 'rejected') {
    logger.error(
      { event: 'user_activity_read_failed', module: 'activity', userId },
      page.reason,
    );
    return { ...EMPTY, recent: { ...EMPTY.recent, limit } };
  }

  for (const [name, result] of [
    ['count', total],
    ['tallies', tallies],
    ['topPaths', topPaths],
    ['signIns', signIns],
  ] as const) {
    if (result.status === 'rejected') {
      logger.warn(
        { event: 'user_activity_panel_failed', module: 'activity', userId, panel: name },
        result.reason,
      );
    }
  }

  return {
    tallies: settled(tallies, []).map((tally) => ({
      kind: tally.kind,
      total: tally.total,
      lastAt: tally.lastAt.toISOString(),
    })),
    topPaths: settled(topPaths, []),
    devices: groupDevices(settled(signIns, [])),
    recent: {
      events: page.value.map(toActivityEventDto),
      // Falls back to what is on screen rather than to zero: "showing 50 of 0"
      // reads as a bug, and the count is only ever used to drive a pager.
      total: settled(total, page.value.length),
      limit,
      offset,
    },
    degraded: false,
  };
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

/**
 * Collapses sign-in events into the distinct devices they came from.
 *
 * Derived rather than stored, because "their devices" is a question about their
 * history — a separate table would be a second copy that drifts from the events
 * that produced it.
 *
 * The key is browser, device class and address digest together. Not the digest
 * alone: a household behind one address is one digest and several devices. Not the
 * device alone: the same laptop from home and from an airport is worth seeing as
 * two rows, because "signed in from somewhere new" is the thing an operator is
 * looking for.
 */
function groupDevices(signIns: readonly ActivityEvent[]): KnownDeviceDto[] {
  const byKey = new Map<string, KnownDeviceDto>();

  for (const event of signIns) {
    const key = [
      event.agent?.device ?? 'unknown',
      event.agent?.browser ?? 'unknown',
      event.ipDigest ?? 'none',
    ].join('|');

    const existing = byKey.get(key);
    const at = event.occurredAt.toISOString();

    if (existing === undefined) {
      byKey.set(key, {
        device: event.agent?.device ?? null,
        browser: event.agent?.browser ?? null,
        ipDigest: event.ipDigest,
        location: event.location,
        firstSeenAt: at,
        lastSeenAt: at,
        signIns: 1,
      });
      continue;
    }

    byKey.set(key, {
      ...existing,
      // Events arrive newest first, so the running minimum is the first sighting
      // and the first one seen is the most recent.
      firstSeenAt: at < existing.firstSeenAt ? at : existing.firstSeenAt,
      lastSeenAt: at > existing.lastSeenAt ? at : existing.lastSeenAt,
      // Keep the newest location: where they are now matters more than where they
      // were the first time this device appeared.
      location: existing.location ?? event.location,
      signIns: existing.signIns + 1,
    });
  }

  return [...byKey.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}
