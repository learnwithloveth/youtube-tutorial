import 'server-only';

import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import { ActivityEvent, type ActivityKind } from '../../domain/event';
import type { ActivityRepository } from '../../application/ports';
import { events, type ActivityEventRow } from './schema';

/**
 * Activity, stored in Postgres.
 *
 * Append and expire. There is no update path, because the module's port does not
 * offer one and an audit row is not a thing that gets corrected in place.
 */
export class DrizzleActivityRepository implements ActivityRepository {
  constructor(private readonly db: Database) {}

  nextId(): string {
    return crypto.randomUUID();
  }

  async append(event: ActivityEvent): Promise<void> {
    await this.db.insert(events).values({
      id: event.id,
      userId: event.userId,
      kind: event.kind,
      occurredAt: event.occurredAt,
      path: event.path,
      durationSeconds: event.durationSeconds,
      locationSource: event.location?.source ?? null,
      locationPrecision: event.location?.precision ?? null,
      city: event.location?.city ?? null,
      region: event.location?.region ?? null,
      country: event.location?.country ?? null,
      latitude: event.location?.latitude ?? null,
      longitude: event.location?.longitude ?? null,
      device: event.agent?.device ?? null,
      browser: event.agent?.browser ?? null,
      ipDigest: event.ipDigest,
      visitorId: event.visitorId,
    });
  }

  async listForUser(query: {
    userId: UserId;
    kinds?: readonly ActivityKind[] | undefined;
    limit: number;
    offset: number;
  }): Promise<ActivityEvent[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(scope(query.userId, query.kinds))
      .orderBy(desc(events.occurredAt))
      .limit(query.limit)
      .offset(query.offset);

    return rows.map(toDomain);
  }

  async countForUser(
    userId: UserId,
    kinds?: readonly ActivityKind[] | undefined,
  ): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(events)
      .where(scope(userId, kinds));

    return rows[0]?.total ?? 0;
  }

  async summariseUser(
    userId: UserId,
  ): Promise<{ kind: ActivityKind; total: number; lastAt: Date }[]> {
    const rows = await this.db
      .select({
        kind: events.kind,
        total: count(),
        lastAt: sql<string>`max(${events.occurredAt})`,
      })
      .from(events)
      .where(eq(events.userId, userId))
      .groupBy(events.kind);

    return rows.map((row) => ({
      kind: row.kind,
      total: row.total,
      lastAt: new Date(row.lastAt),
    }));
  }

  async topPathsForUser(
    userId: UserId,
    limit: number,
  ): Promise<{ path: string; views: number; totalSeconds: number }[]> {
    const rows = await this.db
      .select({
        path: events.path,
        views: count(),
        // `coalesce`, because the most recent view of a page has no duration yet —
        // it is written on departure. Without it a single open tab would turn the
        // whole sum for that route into null.
        totalSeconds: sql<string>`coalesce(sum(${events.durationSeconds}), 0)`,
      })
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.kind, 'page-view')))
      .groupBy(events.path)
      .orderBy(desc(count()))
      .limit(limit);

    return rows.flatMap((row) =>
      row.path === null
        ? []
        : [{ path: row.path, views: row.views, totalSeconds: Number(row.totalSeconds) }],
    );
  }

  /** Bounded delete on the retention index — never a full-table sweep. */
  async deleteExpired(
    cutoffs: { pageViews: Date; security: Date },
    limit: number,
  ): Promise<number> {
    const expired = or(
      and(eq(events.kind, 'page-view'), lt(events.occurredAt, cutoffs.pageViews)),
      and(sql`${events.kind} <> 'page-view'`, lt(events.occurredAt, cutoffs.security)),
    );

    const deleted = await this.db
      .delete(events)
      .where(
        sql`${events.id} IN (
          SELECT ${events.id} FROM ${events}
          WHERE ${expired}
          LIMIT ${limit}
        )`,
      )
      .returning({ id: events.id });

    return deleted.length;
  }
}

function scope(userId: UserId, kinds?: readonly ActivityKind[] | undefined) {
  // An empty array would compile to `IN ()` and silently match nothing, which
  // reads at the call site as "no filter" and behaves as "exclude everything".
  return kinds !== undefined && kinds.length > 0
    ? and(eq(events.userId, userId), inArray(events.kind, [...kinds]))
    : eq(events.userId, userId);
}

/**
 * Rebuilds an event from a row.
 *
 * The location is reconstructed only when the row actually holds one — a source
 * and a precision both present. A partially written location is not a location,
 * and assembling one from four nulls would manufacture a fix asserting nothing.
 */
function toDomain(row: ActivityEventRow): ActivityEvent {
  return ActivityEvent.rehydrate({
    id: row.id,
    userId: row.userId as UserId,
    kind: row.kind,
    occurredAt: row.occurredAt,
    path: row.path,
    durationSeconds: row.durationSeconds,
    location:
      row.locationSource === null || row.locationPrecision === null
        ? null
        : {
            source: row.locationSource,
            precision: row.locationPrecision,
            city: row.city,
            region: row.region,
            country: row.country,
            latitude: row.latitude,
            longitude: row.longitude,
          },
    agent: row.device === null ? null : { device: row.device, browser: row.browser },
    ipDigest: row.ipDigest,
    visitorId: row.visitorId,
  });
}
