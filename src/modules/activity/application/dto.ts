import type { ActivityEvent, ActivityKind, EventLocation } from '../domain/event';

/**
 * Activity DTOs — the module's public data contract.
 *
 * The same restraint the other modules apply: no IP address, no user-agent string,
 * no query strings. An operations console is a screen in an office, and every
 * field that crosses this boundary is one that can end up in a screenshot.
 */

export interface ActivityEventDto {
  readonly id: string;
  readonly userId: string;
  readonly kind: ActivityKind;
  readonly occurredAt: string;
  readonly path: string | null;
  readonly durationSeconds: number | null;
  readonly reference: string | null;
  readonly detail: string | null;
  readonly location: EventLocation | null;
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown' | null;
  readonly browser: string | null;
  /** Truncated keyed hash. Enough to see one address across many events. */
  readonly ipDigest: string | null;
  readonly visitorId: string | null;
}

export interface ActivityPageDto {
  readonly events: readonly ActivityEventDto[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** One line of the "what have they done" header. */
export interface ActivityTallyDto {
  readonly kind: ActivityKind;
  readonly total: number;
  readonly lastAt: string;
}

export interface PathTallyDto {
  readonly path: string;
  readonly views: number;
  readonly totalSeconds: number;
}

/**
 * A device someone has actually signed in from.
 *
 * Derived from sign-in events rather than stored as its own table: "their
 * devices" is a question about their history, and keeping a second list in sync
 * with the events that produced it is how the two come to disagree.
 */
export interface KnownDeviceDto {
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown' | null;
  readonly browser: string | null;
  readonly ipDigest: string | null;
  readonly location: EventLocation | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly signIns: number;
}

export interface UserActivityDto {
  readonly tallies: readonly ActivityTallyDto[];
  readonly topPaths: readonly PathTallyDto[];
  readonly devices: readonly KnownDeviceDto[];
  readonly recent: ActivityPageDto;
  /**
   * True when the read degraded — see `getUserActivity`.
   *
   * An empty history because someone has done nothing and an empty history
   * because the query failed are different facts, and a console must be able to
   * say which it is looking at.
   */
  readonly degraded: boolean;
}

export function toActivityEventDto(event: ActivityEvent): ActivityEventDto {
  return {
    id: event.id,
    userId: event.userId,
    kind: event.kind,
    occurredAt: event.occurredAt.toISOString(),
    path: event.path,
    durationSeconds: event.durationSeconds,
    reference: event.reference,
    detail: event.detail,
    location: event.location,
    device: event.agent?.device ?? null,
    browser: event.agent?.browser ?? null,
    ipDigest: event.ipDigest,
    visitorId: event.visitorId,
  };
}
