import type { UserId } from '@/shared/kernel/ids';

/**
 * Activity — what an account did, kept.
 *
 * ── Why this is not part of `presence` ─────────────────────────────────────────
 * Presence answers "who is here now" and is explicitly *not* history: one row per
 * open tab, overwritten in place, swept hours later. This answers "what has this
 * account done", which is the opposite shape — append-only, never updated, and
 * retained long enough to be worth consulting.
 *
 * Putting them in one table would force one retention policy onto both. A live
 * board needs rows to disappear the moment they stop being true; an audit trail is
 * worthless if it does. So they are separate contexts that happen to describe the
 * same visitor, and the console joins them.
 *
 * ── An event is immutable, and that changes the location model ─────────────────
 * `presence` carries a `LocationFix` that goes stale, because "where are they" has
 * an answer that expires. An event's location does not: where someone signed in
 * from on Tuesday is still where they signed in from on Tuesday. So the location
 * here is a plain snapshot with no freshness rules — the same data, a genuinely
 * different concept, which is why it is a separate type rather than a shared one.
 */

/**
 * What happened.
 *
 * A closed union rather than a free-text string, so the console can group and
 * filter on it and so a typo cannot invent a new kind of event that nothing
 * renders.
 */
export type ActivityKind =
  | 'page-view'
  | 'sign-up'
  | 'sign-in'
  | 'sign-out'
  | 'password-reset'
  | 'verification-sent'
  | 'email-verified';

/** Everything that is not an ordinary page view — what a security review reads. */
export const SECURITY_KINDS: readonly ActivityKind[] = [
  'sign-up',
  'sign-in',
  'sign-out',
  'password-reset',
  'verification-sent',
  'email-verified',
];

export function isSecurityKind(kind: ActivityKind): boolean {
  return kind !== 'page-view';
}

/**
 * How long each kind is kept.
 *
 * Two windows, because the two kinds of record earn their keep for different
 * lengths of time. A sign-in from an unfamiliar country matters when a dispute
 * surfaces months later, which is the whole reason an audit trail exists. A record
 * that someone read the fees page for forty seconds stops being useful almost
 * immediately and is the more intrusive of the two to hold — it is a browsing
 * history.
 *
 * So security events are kept for a year and page views for thirty days. Both are
 * swept; neither is kept "just in case", which is how a log becomes a liability.
 */
export const PAGE_VIEW_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const SECURITY_RETENTION_MS = 365 * 24 * 60 * 60_000;

export function retentionMsFor(kind: ActivityKind): number {
  return kind === 'page-view' ? PAGE_VIEW_RETENTION_MS : SECURITY_RETENTION_MS;
}

/**
 * Where an event happened, frozen at the moment it did.
 *
 * Every field is optional and independently so, because the sources that produce
 * one resolve different amounts: a CDN may name a country and nothing else. The
 * `source` is carried for the same reason it is in `presence` — a location the
 * device reported and one guessed from an IP address are not the same claim, and
 * an operator comparing two sign-ins needs to know which is which.
 */
export interface EventLocation {
  readonly source: 'device' | 'edge' | 'network';
  readonly precision: 'exact' | 'city' | 'region' | 'country';
  readonly city: string | null;
  readonly region: string | null;
  /** ISO-3166-1 alpha-2. */
  readonly country: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
}

/** What the client was, reduced at the edge so no user-agent string is stored. */
export interface EventAgent {
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  readonly browser: string | null;
}

export interface ActivityEventSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: ActivityKind;
  readonly occurredAt: Date;
  /** The route, for a page view. Null for everything else. */
  readonly path: string | null;
  /**
   * How long the page was open, in seconds.
   *
   * Recorded when the visitor *leaves* a page rather than when they arrive, which
   * is what lets the number exist at all — a dwell time is not knowable at the
   * moment it starts. The page someone is on right now therefore has no event yet;
   * that is `presence`'s job, and the two are shown together on the console.
   */
  readonly durationSeconds: number | null;
  readonly location: EventLocation | null;
  readonly agent: EventAgent | null;
  /** Keyed digest of the connecting address. Never the address. */
  readonly ipDigest: string | null;
  /** The browsing context, so several events can be tied to one tab. */
  readonly visitorId: string | null;
}

/**
 * One thing that happened, once.
 *
 * There are no mutators. An audit record that can be edited is not an audit
 * record, and the absence of a setter is the cheapest way to enforce that — a
 * correction is a new event, not a rewrite of an old one.
 */
export class ActivityEvent {
  readonly id: string;
  readonly userId: UserId;
  readonly kind: ActivityKind;
  readonly occurredAt: Date;
  readonly path: string | null;
  readonly durationSeconds: number | null;
  readonly location: EventLocation | null;
  readonly agent: EventAgent | null;
  readonly ipDigest: string | null;
  readonly visitorId: string | null;

  private constructor(snapshot: ActivityEventSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.kind = snapshot.kind;
    this.occurredAt = snapshot.occurredAt;
    this.path = snapshot.path;
    this.durationSeconds = snapshot.durationSeconds;
    this.location = snapshot.location;
    this.agent = snapshot.agent;
    this.ipDigest = snapshot.ipDigest;
    this.visitorId = snapshot.visitorId;
  }

  static record(snapshot: ActivityEventSnapshot): ActivityEvent {
    if (Number.isNaN(snapshot.occurredAt.getTime())) {
      throw new TypeError('An activity event requires a valid time.');
    }
    // A page view without a route describes nothing, and a sign-in with one
    // implies a route mattered to it. Both are bugs in the caller rather than
    // states to store.
    if (snapshot.kind === 'page-view' && snapshot.path === null) {
      throw new TypeError('A page-view event requires a path.');
    }
    if (snapshot.durationSeconds !== null && snapshot.durationSeconds < 0) {
      throw new RangeError('A duration cannot be negative.');
    }
    return new ActivityEvent(snapshot);
  }

  static rehydrate(snapshot: ActivityEventSnapshot): ActivityEvent {
    return new ActivityEvent(snapshot);
  }

  get isSecurityEvent(): boolean {
    return isSecurityKind(this.kind);
  }

  /** When this event may be deleted. Drives the sweep. */
  expiresAt(): Date {
    return new Date(this.occurredAt.getTime() + retentionMsFor(this.kind));
  }
}
