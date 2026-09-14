/**
 * activity — public API, safe to import anywhere.
 *
 * Types, DTOs and the retention constants. Composition lives in `./server`, which
 * is `server-only`, for the reason the other modules split: a barrel is imported
 * whole, so a Client Component reading `ActivityKind` for a filter chip would
 * otherwise drag the database client into the browser bundle.
 *
 * No `ActivityEvent` is exported. Callers get DTOs — code holding the entity could
 * read `expiresAt` and act on a retention rule that is the sweep's business alone.
 */

export type {
  ActivityEventDto,
  ActivityPageDto,
  ActivityTallyDto,
  KnownDeviceDto,
  PathTallyDto,
  UserActivityDto,
} from './application/dto';

export type { ActivityKind, EventAgent, EventLocation } from './domain/event';
export {
  isSecurityKind,
  PAGE_VIEW_RETENTION_MS,
  SECURITY_KINDS,
  SECURITY_RETENTION_MS,
} from './domain/event';

/*
 * `getUserActivity` is NOT re-exported here, though it is a pure function over
 * ports. It logs, and the logger is `server-only` — the same trap `presence`
 * documents. It lives in `./server`.
 */
export type { UserActivityOptions } from './application/queries/user-activity';
