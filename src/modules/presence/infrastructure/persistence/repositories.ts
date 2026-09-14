import 'server-only';

import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import { Coordinates, LocationFix } from '../../domain/location';
import { Presence, type VisitorId } from '../../domain/presence';
import type { PresenceRepository } from '../../application/ports';
import { presences, type PresenceRow } from './schema';

/**
 * Presence, stored in Postgres.
 *
 * The write is an upsert on the primary key, because a heartbeat has no idea
 * whether it is the first one for this tab and should not have to ask. Read,
 * decide, write would cost a round trip and lose a race with the next beat from
 * the same tab.
 */
export class DrizzlePresenceRepository implements PresenceRepository {
  constructor(private readonly db: Database) {}

  async find(id: VisitorId): Promise<Presence | null> {
    const rows = await this.db
      .select()
      .from(presences)
      .where(sql`${presences.id} = ${id}`)
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  }

  async save(presence: Presence): Promise<void> {
    const snapshot = presence.toSnapshot();
    const fix = snapshot.location;

    const values = {
      id: snapshot.id,
      userId: snapshot.userId,
      startedAt: snapshot.startedAt,
      lastSeenAt: snapshot.lastSeenAt,
      path: snapshot.path,
      pathSince: snapshot.pathSince,
      pageViews: snapshot.pageViews,
      engagement: snapshot.engagement,
      locationSource: fix?.source ?? null,
      locationPrecision: fix?.precision ?? null,
      latitude: fix?.coordinates?.latitude ?? null,
      longitude: fix?.coordinates?.longitude ?? null,
      accuracyMetres: fix?.accuracyMetres ?? null,
      city: fix?.place.city ?? null,
      region: fix?.place.region ?? null,
      country: fix?.place.country ?? null,
      timezone: fix?.place.timezone ?? null,
      locationObservedAt: fix?.observedAt ?? null,
      device: snapshot.agent?.device ?? null,
      browser: snapshot.agent?.browser ?? null,
      ipDigest: snapshot.ipDigest,
      departedAt: snapshot.departedAt,
    };

    await this.db
      .insert(presences)
      .values(values)
      .onConflictDoUpdate({
        target: presences.id,
        // `startedAt` is absent on purpose: it is when this browsing context first
        // reported, and an upsert that refreshed it would reset every visitor's
        // session length to zero every twenty seconds.
        set: {
          userId: sql`excluded.user_id`,
          lastSeenAt: sql`excluded.last_seen_at`,
          path: sql`excluded.path`,
          pathSince: sql`excluded.path_since`,
          pageViews: sql`excluded.page_views`,
          engagement: sql`excluded.engagement`,
          locationSource: sql`excluded.location_source`,
          locationPrecision: sql`excluded.location_precision`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          accuracyMetres: sql`excluded.accuracy_metres`,
          city: sql`excluded.city`,
          region: sql`excluded.region`,
          country: sql`excluded.country`,
          timezone: sql`excluded.timezone`,
          locationObservedAt: sql`excluded.location_observed_at`,
          device: sql`excluded.device`,
          browser: sql`excluded.browser`,
          ipDigest: sql`excluded.ip_digest`,
          departedAt: sql`excluded.departed_at`,
        },
      });
  }

  async listSince(since: Date, limit: number): Promise<Presence[]> {
    const rows = await this.db
      .select()
      .from(presences)
      .where(gte(presences.lastSeenAt, since))
      .orderBy(desc(presences.lastSeenAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async listForUser(userId: UserId, since: Date, limit: number): Promise<Presence[]> {
    const rows = await this.db
      .select()
      .from(presences)
      .where(and(eq(presences.userId, userId), gte(presences.lastSeenAt, since)))
      .orderBy(desc(presences.lastSeenAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  /** Bounded delete on the last-seen index — never a full-table sweep. */
  async deleteExpired(before: Date, limit: number): Promise<number> {
    const deleted = await this.db
      .delete(presences)
      .where(
        sql`${presences.id} IN (
          SELECT ${presences.id} FROM ${presences}
          WHERE ${lt(presences.lastSeenAt, before)}
          LIMIT ${limit}
        )`,
      )
      .returning({ id: presences.id });

    return deleted.length;
  }
}

/**
 * Rebuilds the aggregate from a row.
 *
 * The location half reconstructs a `LocationFix` only when the row actually holds
 * one — source, precision and observation time all present. A partially written
 * location is not a location, and rehydrating one would manufacture exactly the
 * unattributed fix the domain refuses to let anyone construct.
 */
function toDomain(row: PresenceRow): Presence {
  return Presence.rehydrate({
    id: row.id as VisitorId,
    userId: (row.userId as UserId | null) ?? null,
    startedAt: row.startedAt,
    lastSeenAt: row.lastSeenAt,
    path: row.path,
    pathSince: row.pathSince,
    pageViews: row.pageViews,
    engagement: row.engagement,
    location: toLocationFix(row),
    agent: row.device === null ? null : { device: row.device, browser: row.browser },
    ipDigest: row.ipDigest,
    departedAt: row.departedAt,
  });
}

function toLocationFix(row: PresenceRow): LocationFix | null {
  if (row.locationSource === null || row.locationPrecision === null) return null;
  if (row.locationObservedAt === null) return null;

  return LocationFix.rehydrate({
    source: row.locationSource,
    precision: row.locationPrecision,
    coordinates: Coordinates.parse(row.latitude, row.longitude),
    place: {
      city: row.city,
      region: row.region,
      country: row.country,
      timezone: row.timezone,
    },
    accuracyMetres: row.accuracyMetres,
    observedAt: row.locationObservedAt,
  });
}
