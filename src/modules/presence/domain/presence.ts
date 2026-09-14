import { secondsBetween, type Clock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { LocationFix } from './location';

/**
 * Presence — one browsing context, at one moment, on one page.
 *
 * ── Why the aggregate is a tab and not a user ───────────────────────────────────
 * "Which page is this person on" only has an answer per tab. A user with the
 * markets page open in one window and the trade screen in another is on both, and
 * an aggregate keyed by user id would have to pick one and be wrong. So the
 * identity of this record is the *browsing context* — a value the client mints per
 * tab and forgets when the tab closes — and the user id is an attribute that gets
 * attached when there is a session. Anonymous visitors are first-class: most
 * traffic on a public exchange is signed out, and a live board that only shows
 * logged-in users answers the wrong question.
 *
 * ── It is not history ──────────────────────────────────────────────────────────
 * One row per browsing context, overwritten in place. There is no trail of every
 * page every visitor ever saw, because presence is a question about *now* and the
 * cheapest way to not leak a browsing history is to not keep one.
 */

declare const brand: unique symbol;

/**
 * The id of one browsing context.
 *
 * Branded so it cannot be passed where a `UserId` belongs — the two are both
 * strings and are adjacent in every signature in this module, which is exactly the
 * shape of bug branding exists to make impossible.
 */
export type VisitorId = string & { readonly [brand]: 'VisitorId' };

/** What the client last said about whether anyone is actually looking. */
export type Engagement = 'engaged' | 'backgrounded';

/**
 * How present someone is.
 *
 * Three states rather than a boolean because the honest answer to "are they here?"
 * has a middle: a tab that is open behind another window is neither gone nor
 * watching. Browsers also throttle timers hard in background tabs, so a
 * backgrounded visitor's heartbeats arrive late by design — treating late as gone
 * would make the board flicker.
 */
export type ActivityState = 'active' | 'idle' | 'gone';

export type LocationState =
  | { readonly kind: 'live'; readonly fix: LocationFix }
  | { readonly kind: 'stale'; readonly fix: LocationFix; readonly ageSeconds: number }
  | { readonly kind: 'unavailable' };

/**
 * How often a live client reports in.
 *
 * Twenty seconds is a compromise between a board that feels live and a write per
 * visitor per beat. The windows below are derived from it, so changing this one
 * number moves them together rather than leaving them inconsistent.
 */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** Beaten within this, and looking at the tab: `active`. Three beats of slack. */
export const ACTIVE_WINDOW_MS = HEARTBEAT_INTERVAL_MS * 3;

/**
 * Beaten within this but not within the active window: `idle`. Past it: `gone`.
 *
 * Five minutes is set by browser throttling, not by taste. A hidden tab's timers
 * are clamped to roughly once a minute, and a machine that has been asleep fires
 * nothing at all, so a window tight enough to be "accurate" would drop visitors who
 * are still there and put them back seconds later.
 */
export const IDLE_WINDOW_MS = 5 * 60_000;

/**
 * How long a departed or abandoned row is kept before it is swept.
 *
 * This is a retention limit on personal data, not a cache policy. A presence row
 * carries a coarse location and a page path; nothing downstream reads one an hour
 * after it went quiet, so keeping it longer would be collecting for its own sake.
 */
export const PRESENCE_RETENTION_MS = 6 * 60 * 60_000;

/** Longest path recorded. Bounds what an untrusted heartbeat can write. */
export const MAX_PATH_LENGTH = 512;

/**
 * Reduces a client-reported URL to the route we are willing to store.
 *
 * ── The query string is dropped, deliberately ───────────────────────────────────
 * This application puts single-use credentials in query strings: `/verify-email`
 * and `/reset-password` both arrive as `?token=…`. Recording a visitor's full URL
 * would copy those tokens into a table an operator can read, turning a live-traffic
 * board into a way to take over an account. The fragment goes for the same reason
 * and hashes never reach the server anyway.
 *
 * Returns null for anything that is not a same-origin path, which is what an
 * absolute URL or a scheme-relative one would be.
 */
export function normalisePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PATH_LENGTH) return null;

  // Must be a rooted path. `//evil.example` is protocol-relative, not a path.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;

  const path = trimmed.split(/[?#]/, 1)[0] ?? '/';
  if (path.length === 0) return '/';

  // Control characters would corrupt a log line and have no business in a route.
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;

  // Trailing slashes are cosmetic; collapsing them stops `/markets` and
  // `/markets/` counting as two pages on the busiest-pages panel.
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}

/** Coarse client description, parsed at the edge so no user-agent string is stored. */
export interface AgentSummary {
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  /** Browser family, e.g. `Safari`. Null when the string said nothing useful. */
  readonly browser: string | null;
}

export interface PresenceSnapshot {
  readonly id: VisitorId;
  readonly userId: UserId | null;
  readonly startedAt: Date;
  readonly lastSeenAt: Date;
  readonly path: string;
  readonly pathSince: Date;
  readonly pageViews: number;
  readonly engagement: Engagement;
  readonly location: LocationFix | null;
  readonly agent: AgentSummary | null;
  /**
   * Keyed digest of the connecting address — never the address.
   *
   * The same rule the identity module applies to `identity.sessions.ip_hash`: an unkeyed
   * hash of an IPv4 address is brute-forceable in seconds, so this is an HMAC under
   * a server-held key. It exists to correlate a visitor across tabs and to spot one
   * address driving many, neither of which needs the address itself.
   */
  readonly ipDigest: string | null;
  readonly departedAt: Date | null;
}

export class Presence {
  readonly id: VisitorId;
  private _userId: UserId | null;
  readonly startedAt: Date;
  private _lastSeenAt: Date;
  private _path: string;
  private _pathSince: Date;
  private _pageViews: number;
  private _engagement: Engagement;
  private _location: LocationFix | null;
  private _agent: AgentSummary | null;
  private _ipDigest: string | null;
  private _departedAt: Date | null;

  private constructor(snapshot: PresenceSnapshot) {
    this.id = snapshot.id;
    this._userId = snapshot.userId;
    this.startedAt = snapshot.startedAt;
    this._lastSeenAt = snapshot.lastSeenAt;
    this._path = snapshot.path;
    this._pathSince = snapshot.pathSince;
    this._pageViews = snapshot.pageViews;
    this._engagement = snapshot.engagement;
    this._location = snapshot.location;
    this._agent = snapshot.agent;
    this._ipDigest = snapshot.ipDigest;
    this._departedAt = snapshot.departedAt;
  }

  static begin(input: {
    id: VisitorId;
    userId: UserId | null;
    path: string;
    engagement: Engagement;
    agent: AgentSummary | null;
    ipDigest: string | null;
    now: Date;
  }): Presence {
    return new Presence({
      id: input.id,
      userId: input.userId,
      startedAt: input.now,
      lastSeenAt: input.now,
      path: input.path,
      pathSince: input.now,
      pageViews: 1,
      engagement: input.engagement,
      location: null,
      agent: input.agent,
      ipDigest: input.ipDigest,
      departedAt: null,
    });
  }

  static rehydrate(snapshot: PresenceSnapshot): Presence {
    return new Presence(snapshot);
  }

  get userId(): UserId | null {
    return this._userId;
  }
  get lastSeenAt(): Date {
    return this._lastSeenAt;
  }
  get path(): string {
    return this._path;
  }
  get pathSince(): Date {
    return this._pathSince;
  }
  get pageViews(): number {
    return this._pageViews;
  }
  get engagement(): Engagement {
    return this._engagement;
  }
  get location(): LocationFix | null {
    return this._location;
  }
  get agent(): AgentSummary | null {
    return this._agent;
  }
  get ipDigest(): string | null {
    return this._ipDigest;
  }
  get departedAt(): Date | null {
    return this._departedAt;
  }

  /**
   * Records a heartbeat.
   *
   * `pageViews` increments only when the path actually changed, so a visitor
   * reading one page for ten minutes registers one view rather than thirty. That
   * also makes `pathSince` mean "arrived here", which is what a dwell time is
   * measured from.
   */
  record(input: { now: Date; path: string; engagement: Engagement }): void {
    if (input.path !== this._path) {
      this._path = input.path;
      this._pathSince = input.now;
      this._pageViews += 1;
    }
    this._engagement = input.engagement;
    this._lastSeenAt = input.now;
    // A beat after a departure means the tab came back — a `pagehide` fires on
    // every bfcache navigation, so this is the normal case, not an anomaly.
    this._departedAt = null;
  }

  /**
   * Attaches a session to a context that was anonymous, or was someone else's.
   *
   * A tab that signs in keeps its id, so the row has to be able to gain a user.
   * It has to be able to *change* user too: signing out and back in as someone
   * else in the same tab must not leave the previous account on the board.
   */
  identify(userId: UserId | null): void {
    this._userId = userId;
  }

  /**
   * Takes a fix only when it beats the one already held.
   *
   * The guard lives here rather than at the call site because every heartbeat
   * carries an address-derived fix and only some carry a device one. Without it the
   * last writer would win and a precise consented location would be overwritten,
   * twenty seconds later, by a city guessed from an IP address.
   */
  locate(fix: LocationFix, clock: Clock): boolean {
    if (!fix.supersedes(this._location, clock)) return false;
    this._location = fix;
    return true;
  }

  /** Replaces the parsed client description, e.g. when a beat arrives from a new device. */
  describeAgent(agent: AgentSummary | null): void {
    if (agent !== null) this._agent = agent;
  }

  setIpDigest(digest: string | null): void {
    if (digest !== null) this._ipDigest = digest;
  }

  /** The tab told us it is closing. */
  depart(now: Date): void {
    this._departedAt = now;
    this._lastSeenAt = now;
  }

  activityAt(clock: Clock): ActivityState {
    if (this._departedAt !== null) return 'gone';

    const silentMs = clock.now().getTime() - this._lastSeenAt.getTime();
    if (silentMs > IDLE_WINDOW_MS) return 'gone';
    if (this._engagement === 'backgrounded') return 'idle';
    if (silentMs > ACTIVE_WINDOW_MS) return 'idle';
    return 'active';
  }

  /**
   * Where they are, or an honest statement that we do not know.
   *
   * The three-way union is the point: a caller cannot render a location without
   * having decided what to do when the fix has aged out and when there was never
   * one at all, because the type will not narrow until they have.
   */
  locationStateAt(clock: Clock): LocationState {
    const fix = this._location;
    if (fix === null) return { kind: 'unavailable' };
    if (fix.isStaleAt(clock)) {
      return { kind: 'stale', fix, ageSeconds: fix.ageInSecondsAt(clock) };
    }
    return { kind: 'live', fix };
  }

  /** Seconds on the current page. The dwell time the console shows. */
  secondsOnPageAt(clock: Clock): number {
    return secondsBetween(clock.now(), this._pathSince);
  }

  /** Seconds since this browsing context first reported in. */
  sessionSecondsAt(clock: Clock): number {
    return secondsBetween(clock.now(), this.startedAt);
  }

  toSnapshot(): PresenceSnapshot {
    return {
      id: this.id,
      userId: this._userId,
      startedAt: this.startedAt,
      lastSeenAt: this._lastSeenAt,
      path: this._path,
      pathSince: this._pathSince,
      pageViews: this._pageViews,
      engagement: this._engagement,
      location: this._location,
      agent: this._agent,
      ipDigest: this._ipDigest,
      departedAt: this._departedAt,
    };
  }
}
