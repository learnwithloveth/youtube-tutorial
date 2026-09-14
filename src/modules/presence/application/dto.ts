import type { Clock } from '@/shared/kernel';

import type { LocationPrecision, LocationSource } from '../domain/location';
import type { ActivityState, Presence } from '../domain/presence';

/**
 * Presence DTOs — the module's public data contract.
 *
 * Note what does not cross this boundary: no IP address, no user-agent string, no
 * query strings. The console gets a device class, a city and a route. Every field
 * that crosses is a field that can end up in a screenshot, a log aggregator or a
 * support ticket, so the set is the smallest one that answers the question the
 * console exists to answer.
 *
 * `ipDigest` is the one identifier that crosses, and only as a truncated keyed
 * hash — enough to see one address driving forty tabs, not enough to recover the
 * address.
 */

export interface LocationDto {
  readonly source: LocationSource;
  readonly precision: LocationPrecision;
  /** Exact decimal strings, or null when the fix resolved a place but no point. */
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly accuracyMetres: number | null;
  readonly city: string | null;
  readonly region: string | null;
  /** ISO-3166-1 alpha-2. */
  readonly country: string | null;
  readonly timezone: string | null;
  readonly observedAt: string;
  readonly ageSeconds: number;
  /**
   * Whether the fix is recent enough to present as current.
   *
   * Carried on the DTO rather than recomputed by the consumer, because the rule
   * for what counts as stale is a domain decision and a React component is not
   * where it should be re-derived.
   */
  readonly freshness: 'live' | 'stale';
}

export interface ActiveVisitorDto {
  readonly visitorId: string;
  /** Present when this browsing context has a session. Most traffic will not. */
  readonly userId: string | null;
  readonly path: string;
  readonly secondsOnPage: number;
  readonly sessionSeconds: number;
  readonly pageViews: number;
  readonly activity: Exclude<ActivityState, 'gone'>;
  /** Null is a state to render, not a gap to fill — see `LocationFix`. */
  readonly location: LocationDto | null;
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  readonly browser: string | null;
  readonly ipDigest: string | null;
  readonly startedAt: string;
  readonly lastSeenAt: string;
}

/** How many people are on one route right now. */
export interface PagePresenceDto {
  readonly path: string;
  readonly active: number;
  readonly idle: number;
  readonly total: number;
}

/** How many people are in one country right now. */
export interface CountryPresenceDto {
  /** ISO-3166-1 alpha-2, or null for the visitors whose location is unavailable. */
  readonly country: string | null;
  readonly total: number;
}

export interface LiveActivityDto {
  readonly visitors: readonly ActiveVisitorDto[];
  readonly pages: readonly PagePresenceDto[];
  readonly countries: readonly CountryPresenceDto[];
  readonly totals: {
    readonly active: number;
    readonly idle: number;
    readonly signedIn: number;
    readonly anonymous: number;
    /** Visitors whose location we could not establish at all. */
    readonly located: number;
    readonly unlocated: number;
  };
  /** When this snapshot was taken, so a polling client can show its own lag. */
  readonly observedAt: string;
  /**
   * True when the read path degraded — see `listLiveActivity`.
   *
   * An empty board because nobody is browsing and an empty board because the
   * database is unreachable are different facts, and the console has to be able to
   * say which one it is looking at.
   */
  readonly degraded: boolean;
}

export function toActiveVisitorDto(
  presence: Presence,
  clock: Clock,
): ActiveVisitorDto | null {
  const activity = presence.activityAt(clock);
  if (activity === 'gone') return null;

  const location = presence.locationStateAt(clock);

  return {
    visitorId: presence.id,
    userId: presence.userId,
    path: presence.path,
    secondsOnPage: presence.secondsOnPageAt(clock),
    sessionSeconds: presence.sessionSecondsAt(clock),
    pageViews: presence.pageViews,
    activity,
    location:
      location.kind === 'unavailable'
        ? null
        : {
            source: location.fix.source,
            precision: location.fix.precision,
            latitude: location.fix.coordinates?.latitude ?? null,
            longitude: location.fix.coordinates?.longitude ?? null,
            accuracyMetres: location.fix.accuracyMetres,
            city: location.fix.place.city,
            region: location.fix.place.region,
            country: location.fix.place.country,
            timezone: location.fix.place.timezone,
            observedAt: location.fix.observedAt.toISOString(),
            ageSeconds: location.fix.ageInSecondsAt(clock),
            freshness: location.kind,
          },
    device: presence.agent?.device ?? 'unknown',
    browser: presence.agent?.browser ?? null,
    ipDigest: presence.ipDigest,
    startedAt: presence.startedAt.toISOString(),
    lastSeenAt: presence.lastSeenAt.toISOString(),
  };
}
