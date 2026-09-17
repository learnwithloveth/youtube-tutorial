import { err, ok, type Result } from '@/shared/kernel';
import { isUuid, type UserId } from '@/shared/kernel/ids';

import { reportInvalid, visitorUnknown, type PresenceError } from '../../domain/errors';
import { Coordinates, LocationFix, MAX_FIX_AGE_SECONDS } from '../../domain/location';
import {
  HEARTBEAT_INTERVAL_MS,
  normalisePath,
  Presence,
  type Engagement,
  type VisitorId,
} from '../../domain/presence';
import { toLocationDto, type LocationDto } from '../dto';
import type { NetworkContext, PresenceDependencies } from '../ports';

/**
 * What a client reports.
 *
 * Every field is untrusted. This is a public endpoint — it has to be, because most
 * visitors to an exchange are signed out and they are the majority of the traffic
 * the console exists to watch — so each field is parsed rather than read.
 *
 * Note the absence of a user id. The client does not get to say who it is; the
 * session cookie does, and the route handler resolves that through `getAuth()`
 * before calling this. A reported user id would make impersonating another
 * account's presence a matter of typing one.
 */
export interface PresenceReport {
  readonly visitorId: unknown;
  readonly path: unknown;
  readonly event?: unknown;
  readonly engagement?: unknown;
  /**
   * A fix from the browser Geolocation API, present only when the visitor granted
   * permission. Absent on every other beat, which is the normal case.
   */
  readonly device?:
    | {
        readonly latitude?: unknown;
        readonly longitude?: unknown;
        readonly accuracyMetres?: unknown;
        readonly observedAt?: unknown;
      }
    | null
    | undefined;
}

export interface RecordPresenceInput {
  readonly report: PresenceReport;
  /** Derived from the session by the caller. Never taken from the report. */
  readonly userId: UserId | null;
  readonly network: NetworkContext;
}

export interface RecordPresenceResult {
  readonly visitorId: string;
  /** How long the client should wait before reporting again, in milliseconds. */
  readonly nextBeatMs: number;
  /**
   * True on the beat a browsing context first reported as this account: a new tab
   * opened while signed in, or an anonymous tab that has just signed in.
   *
   * Whether that makes a *visit* — or is one more tab of a visit already under way
   * — needs the account's other tabs, which is the caller's question to ask; see
   * `server/admin-alerts.ts`. It is false for anonymous traffic.
   */
  readonly arrived: boolean;
  /** The page this beat reported, normalised to a route — what an arrival lands on. */
  readonly path: string;
  /**
   * The page the visitor just left, on the beat that moved them off it.
   *
   * ── Why presence reports this at all ───────────────────────────────────────
   * Presence keeps no history — one row per tab, overwritten — and that is not
   * going to change. But it is the only thing that *knows* a navigation happened,
   * and it knows the dwell time, which is unknowable at the moment a page opens
   * and lost the instant the row is overwritten.
   *
   * So it reports what it observed and takes no view on what should be done with
   * it. The caller decides whether that becomes a durable record. That keeps the
   * dependency pointing the right way: presence does not know the activity module
   * exists, and could not write to it if it wanted to.
   */
  readonly departedPage: {
    readonly path: string;
    readonly arrivedAt: string;
    readonly seconds: number;
  } | null;
  /**
   * What was observed alongside the beat.
   *
   * Handed back rather than re-read, because a caller writing this into a history
   * would otherwise have to resolve the same location a second time.
   */
  readonly observed: {
    readonly location: LocationDto | null;
    readonly device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown' | null;
    readonly browser: string | null;
    readonly ipDigest: string | null;
  };
}

/**
 * Records where one browsing context is, and works out where in the world it is.
 *
 * ── Location, whether or not permission was granted ─────────────────────────────
 * Two sources are applied on every beat and the better one wins:
 *
 *  1. The connection itself — CDN geo headers when something in front of us
 *     attached them, an address lookup otherwise. Needs no permission, so it is
 *     always attempted and is the answer for the overwhelming majority of traffic.
 *  2. The device, when the visitor granted the browser permission and the client
 *     therefore had a precise fix to send.
 *
 * `Presence.locate` arbitrates rather than last-writer-wins, which matters because
 * the address fix arrives on *every* beat and the device fix does not: without the
 * rule, a consented GPS position would be overwritten twenty seconds later by a
 * city guessed from an IP address.
 */
export function createRecordPresence(deps: PresenceDependencies) {
  return async function recordPresence(
    input: RecordPresenceInput,
  ): Promise<Result<RecordPresenceResult, PresenceError>> {
    const now = deps.clock.now();

    const parsed = parseReport(input.report, now);
    if (!parsed.ok) return parsed;

    const { visitorId, path, event, engagement, device } = parsed.value;
    const ipDigest = input.network.ip ? deps.digest.hash(input.network.ip) : null;

    const existing = await deps.presences.find(visitorId);
    const arrived = input.userId !== null && (existing === null || existing.userId !== input.userId);

    if (existing !== null && !mayClaim(existing.userId, input.userId)) {
      // The row belongs to a signed-in account and this request is not that
      // account. Ordinarily this is a tab that signed out and back in as someone
      // else; the client answers by minting a new context id. Either way, nothing
      // is written, so a guessed id cannot move an account's pin on the map.
      return err(visitorUnknown(visitorId));
    }

    // Read before the row is updated: the lookup decision below turns on whether
    // the address *changed*, which is unanswerable once the new digest is in place.
    const addressMoved = existing !== null && ipDigest !== null && existing.ipDigest !== ipDigest;

    const presence =
      existing ??
      Presence.begin({
        id: visitorId,
        userId: input.userId,
        path,
        engagement,
        agent: deps.agents.parse(input.network.userAgent),
        ipDigest,
        now,
      });

    // Captured before `record` overwrites them: a dwell time is only knowable at
    // the moment it ends, and one line later the row no longer remembers where the
    // visitor was or when they got there.
    const leftPath = existing !== null && existing.path !== path ? existing.path : null;
    const leftSince = existing?.pathSince ?? null;

    if (existing !== null) {
      presence.identify(input.userId);
      presence.describeAgent(deps.agents.parse(input.network.userAgent));
      presence.setIpDigest(ipDigest);
      presence.record({ now, path, engagement });
    }

    if (event === 'leave') {
      presence.depart(now);
      await deps.presences.save(presence);
      return ok({
        visitorId,
        nextBeatMs: 0,
        // A tab that is closing has not arrived anywhere.
        arrived: false,
        path: presence.path,
        // A closing tab leaves the page it was on, which is the last chance to
        // record how long it was open.
        departedPage: departure(presence.path, presence.pathSince, now),
        observed: observationOf(presence, deps),
      });
    }

    if (addressMoved || needsAddressLookup(presence, deps)) {
      const fix = await deps.locations.resolve(input.network, now);
      if (fix !== null) presence.locate(fix, deps.clock);
    }

    if (device !== null) {
      presence.locate(device, deps.clock);
    }

    await deps.presences.save(presence);

    // Handed back on every beat rather than compiled into the client bundle, so
    // the cadence can be widened under load without waiting for every open tab to
    // reload to pick up the new number.
    return ok({
      visitorId,
      nextBeatMs: HEARTBEAT_INTERVAL_MS,
      arrived,
      path: presence.path,
      departedPage: leftPath === null ? null : departure(leftPath, leftSince, now),
      observed: observationOf(presence, deps),
    });
  };
}

export type RecordPresence = ReturnType<typeof createRecordPresence>;

/**
 * Whether a row may be written by a request carrying this identity.
 *
 * An anonymous row can be claimed by anyone — it has no account attached and the
 * id is a CSPRNG value the client minted for itself. A row that names a user may
 * only be written by that user.
 */
function mayClaim(existing: UserId | null, requester: UserId | null): boolean {
  return existing === null || existing === requester;
}

/**
 * Whether this beat should pay for an address lookup.
 *
 * Skipping it when we already hold a live fix from the same address is what keeps
 * a third party off the critical path of every twenty-second heartbeat of every
 * open tab. The adapter caches too, but the cheapest lookup is the one that is
 * never requested.
 *
 * A live device fix suppresses the lookup as well. It is precise, so an address
 * lookup could not improve it and would be spent only to be discarded by
 * `supersedes`.
 *
 * The other trigger — the connecting address changed — is decided by the caller,
 * which is the only place that still knows what the previous address was.
 */
function needsAddressLookup(presence: Presence, deps: PresenceDependencies): boolean {
  return presence.locationStateAt(deps.clock).kind !== 'live';
}

interface ParsedReport {
  visitorId: VisitorId;
  path: string;
  event: 'heartbeat' | 'leave';
  engagement: Engagement;
  device: LocationFix | null;
}

function parseReport(
  report: PresenceReport,
  now: Date,
): Result<ParsedReport, PresenceError> {
  if (typeof report.visitorId !== 'string' || !isUuid(report.visitorId)) {
    return err(reportInvalid('visitorId must be a UUID'));
  }

  const path = normalisePath(report.path);
  if (path === null) {
    return err(reportInvalid('path must be a same-origin route'));
  }

  const event = report.event === 'leave' ? 'leave' : 'heartbeat';
  const engagement: Engagement =
    report.engagement === 'backgrounded' ? 'backgrounded' : 'engaged';

  return ok({
    visitorId: report.visitorId as VisitorId,
    path,
    event,
    engagement,
    device: parseDeviceFix(report.device, now),
  });
}

/**
 * Builds a device fix from the report, or null.
 *
 * ── The clamp ──────────────────────────────────────────────────────────────────
 * The observation time is client-supplied, so it is pinned into the window
 * `[now - MAX_FIX_AGE_SECONDS, now]`. A client claiming a fix from tomorrow would
 * otherwise sit permanently at the top of every freshness comparison and never age
 * out; one claiming a fix from last week would be presented as a current location.
 *
 * ── Why `now` is passed in ─────────────────────────────────────────────────────
 * It comes from the module's clock, not from `Date.now()`. That is not only about
 * testability: the two are genuinely different values here. A visitor's device
 * clock and this server's clock disagree routinely, and by more than the staleness
 * window often enough to matter. Clamping a client timestamp against the wall clock
 * of whichever process happened to answer would push a perfectly good fix outside
 * the window, mark it stale, and let the next IP guess overwrite it — so a visitor
 * who granted precise location would silently get a city instead.
 */
function parseDeviceFix(device: PresenceReport['device'], now: Date): LocationFix | null {
  if (device === null || device === undefined) return null;

  const coordinates = Coordinates.parse(device.latitude, device.longitude);
  if (coordinates === null) return null;

  const current = now.getTime();
  const floor = current - MAX_FIX_AGE_SECONDS * 1000;

  const reported =
    typeof device.observedAt === 'string' ? Date.parse(device.observedAt) : Number.NaN;
  const observedAt = Number.isFinite(reported)
    ? new Date(Math.min(Math.max(reported, floor), current))
    : new Date(current);

  return LocationFix.device({
    coordinates,
    accuracyMetres:
      typeof device.accuracyMetres === 'number' ? device.accuracyMetres : null,
    observedAt,
  });
}

function departure(
  path: string,
  arrivedAt: Date | null,
  now: Date,
): RecordPresenceResult['departedPage'] {
  const since = arrivedAt ?? now;
  return {
    path,
    arrivedAt: since.toISOString(),
    // Clamped at zero: a clock adjustment between two beats can otherwise produce
    // a negative dwell, which the domain refuses and which would read as a page
    // visited before it was opened.
    seconds: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000)),
  };
}

function observationOf(
  presence: Presence,
  deps: PresenceDependencies,
): RecordPresenceResult['observed'] {
  return {
    location: toLocationDto(presence, deps.clock),
    device: presence.agent?.device ?? null,
    browser: presence.agent?.browser ?? null,
    ipDigest: presence.ipDigest,
  };
}
