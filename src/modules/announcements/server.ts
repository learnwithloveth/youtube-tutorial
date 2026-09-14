import 'server-only';

/**
 * Server-side entry point for the announcements module.
 *
 * A barrel is imported *whole*, so exporting `registerAnnouncements` from
 * `index.ts` would drag the database client into any Client Component that wanted
 * an `AnnouncementDto` — and the build would fail, correctly.
 *
 *   `@/modules/announcements`        types and policy — safe anywhere
 *   `@/modules/announcements/server` composition, which touches infrastructure
 */

export type { AnnouncementsModule, RegisterAnnouncementsOptions } from './module';
export { registerAnnouncements } from './module';

export {
  getAnnouncementBoard,
  getLiveAnnouncements,
} from './application/queries/read-announcements';
export type {
  ComposeAnnouncementCommand,
  MoveAnnouncementCommand,
} from './application/use-cases/manage-announcement';
