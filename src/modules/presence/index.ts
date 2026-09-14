/**
 * presence — public API, safe to import anywhere.
 *
 * Split by environment like the other modules: this barrel carries types, DTOs,
 * the cadence constants the browser reporter needs, and the one pure function that
 * decides what a client is allowed to report. Composition lives in `./server`,
 * which is `server-only` — see that file for why the split has to exist.
 *
 * `normalisePath` is exported deliberately. The client applies the same rule the
 * server enforces, so a query string carrying a verification token is dropped
 * before it is ever put on the wire rather than being stripped after it arrives.
 * The server still re-applies it: a client-side rule is a convenience, never a
 * control.
 *
 * Note what is absent: no `Presence`, no `LocationFix`, no repository. Callers get
 * DTOs, because code holding a `Presence` could reach past the freshness rules that
 * `locationStateAt` exists to enforce.
 */

export type {
  ActiveVisitorDto,
  CountryPresenceDto,
  LiveActivityDto,
  LocationDto,
  PagePresenceDto,
} from './application/dto';

export type { LocationPrecision, LocationSource } from './domain/location';
export { MAX_FIX_AGE_SECONDS } from './domain/location';

export type { ActivityState, Engagement } from './domain/presence';
export {
  ACTIVE_WINDOW_MS,
  HEARTBEAT_INTERVAL_MS,
  IDLE_WINDOW_MS,
  MAX_PATH_LENGTH,
  normalisePath,
  PRESENCE_RETENTION_MS,
} from './domain/presence';

export type { PresenceError } from './domain/errors';

/*
 * `listLiveActivity` is NOT re-exported here, though it is a pure function over
 * ports and looks like it belongs. It logs, and the logger is `server-only`, so a
 * Client Component importing a type from this barrel would pull that in and fail
 * the build. It lives in `./server` instead — see the note there.
 */
export type { LiveActivityOptions } from './application/queries/live-activity';
