/**
 * announcements — public API, safe to import anywhere.
 *
 * Types, the surface catalogue and error presentation, all of which the console's
 * composer needs in the browser. Composition lives in `./server`, which is
 * `server-only`.
 *
 * The *queries* are not here: they log, and the logger is `server-only`. Same trap
 * `ledger`, `identity`, `presence` and `activity` each document.
 */

export type {
  AnnouncementStatus,
  AnnouncementSurface,
  AnnouncementTone,
} from './domain/announcement';
export { MAX_BODY, MAX_TITLE, SURFACES } from './domain/announcement';

export type { AnnouncementError } from './application/errors';
export { presentAnnouncementError } from './application/errors';

export type {
  AnnouncementBoardDto,
  AnnouncementDto,
} from './application/queries/read-announcements';
