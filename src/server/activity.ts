import 'server-only';

import { cache } from 'react';

import type {
  ActivityKind,
  AuditTrailDto,
  AuditTrailOptions,
  EventLocation,
  UserActivityDto,
} from '@/modules/activity';
import {
  getAuditTrail,
  getUserActivity,
  registerActivity,
  type ActivityModule,
  type RecordActivityCommand,
} from '@/modules/activity/server';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

/**
 * The application's facade over the activity trail.
 *
 * ── Every write here is best-effort, and that is a deliberate trade ────────────
 * Recording activity is never allowed to fail the thing it describes. A sign-in
 * that succeeded must not turn into an error page because the audit insert timed
 * out, and a heartbeat must not 500 for the same reason. So `record` catches
 * everything, logs it, and returns.
 *
 * The cost is stated plainly: this trail can have holes. It is an operations aid —
 * what an operator reads to understand what happened — not a ledger, and nothing
 * in the system makes a decision by consulting it. If it ever needs to be
 * evidential rather than informational, it has to move into the same transaction
 * as the event it records, which is a different design and a much more expensive
 * one.
 */

/**
 * One module instance per request.
 *
 * Not a singleton, for the reason `identity` and `presence` are not: a
 * module-level instance would capture a database handle across requests.
 *
 * Null when no database is configured, which is a supported state — the marketing
 * site renders without one and an audit write must not be what changes that.
 */
export const activity = cache((): ActivityModule | null => {
  const handle = db();
  return handle ? registerActivity({ db: handle }) : null;
});

/** Appends one event. Never throws, never blocks the caller's real work. */
export async function recordActivity(command: RecordActivityCommand): Promise<void> {
  const context = activity();
  if (context === null) return;

  try {
    await context.recordActivity(command);
  } catch (error) {
    logger.warn(
      { event: 'activity_write_failed', module: 'activity', kind: command.kind },
      error,
    );
  }
}

/** Deletes events past the retention window for their kind. See `sweepActivity`. */
export async function sweepActivity(): Promise<number> {
  const context = activity();
  if (context === null) return 0;

  try {
    return await context.sweepActivity();
  } catch (error) {
    logger.warn({ event: 'activity_sweep_failed', module: 'activity' }, error);
    return 0;
  }
}

/**
 * One account's history, for the console.
 *
 * Deduplicated per request so a page that shows both a summary and a timeline
 * costs one read between them rather than two.
 */
export const getActivityForUser = cache(
  async (
    userId: UserId,
    options: { kinds?: readonly ActivityKind[]; limit?: number; offset?: number } = {},
  ): Promise<UserActivityDto> => {
    const context = activity();
    if (context === null) {
      return {
        tallies: [],
        topPaths: [],
        devices: [],
        recent: { events: [], total: 0, limit: options.limit ?? 50, offset: 0 },
        degraded: true,
      };
    }

    return getUserActivity(context.dependencies.events, userId, options);
  },
);

/**
 * Reduces a presence location to the snapshot an event keeps.
 *
 * The mapping lives here, above both modules, because it is the only place
 * allowed to know they both exist. It is also where the two concepts are
 * reconciled: a presence location goes stale, an event's never does, so the
 * freshness fields are dropped rather than frozen into a row where they would be
 * a lie within the hour.
 */
export function toEventLocation(
  location: {
    source: 'device' | 'edge' | 'network';
    precision: 'exact' | 'city' | 'region' | 'country';
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: string | null;
    longitude: string | null;
  } | null,
): EventLocation | null {
  if (location === null) return null;

  return {
    source: location.source,
    precision: location.precision,
    city: location.city,
    region: location.region,
    country: location.country,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

/**
 * The platform's audit trail, with the accounts behind it.
 *
 * ── The join is here, as always ────────────────────────────────────────────────
 * The activity module holds an opaque `UserId` and has never heard of an email
 * address. An audit screen showing thirty-six-character ids is technically
 * complete and operationally useless, so identity is asked separately and the two
 * are zipped above both.
 */
export interface AuditTrailView extends AuditTrailDto {
  /** Keyed by `UserId`. Missing where the directory could not answer. */
  readonly actors: Readonly<Record<string, { email: string; name: string }>>;
}

export async function getAuditTrailFor(options: AuditTrailOptions = {}): Promise<AuditTrailView> {
  const context = activity();
  if (context === null) {
    return { entries: [], total: 0, limit: 50, offset: 0, degraded: true, actors: {} };
  }

  const trail = await getAuditTrail(context.dependencies.events, options);
  if (trail.entries.length === 0) return { ...trail, actors: {} };

  const ids = [...new Set(trail.entries.map((entry) => entry.userId))].flatMap((id) => {
    try {
      return [toUserId(id)];
    } catch {
      return [];
    }
  });

  try {
    // Never fails the trail. An entry whose actor cannot be looked up still has to
    // render — the id is on the row either way, and an audit read while the
    // directory is down is exactly when somebody needs it most.
    const { identity } = await import('./auth');
    const found = await identity().describeUsers(ids);

    return {
      ...trail,
      actors: Object.fromEntries(
        [...found.values()].map((user) => [user.id, { email: user.email, name: user.name }]),
      ),
    };
  } catch (error) {
    logger.warn({ event: 'audit_actor_lookup_failed', module: 'identity' }, error);
    return { ...trail, actors: {} };
  }
}
