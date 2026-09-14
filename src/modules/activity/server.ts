import 'server-only';

/**
 * Server-side entry point for the activity module.
 *
 * The composition root reaches the Drizzle repository. A barrel is imported
 * *whole*, so exporting `registerActivity` from `index.ts` would pull the database
 * client into any Client Component that wanted an `ActivityKind` — and the build
 * would fail, correctly.
 *
 *   `@/modules/activity`        types, DTOs, retention constants — safe anywhere
 *   `@/modules/activity/server` composition, which touches infrastructure
 */

export type { ActivityModule, RegisterActivityOptions } from './module';
export { registerActivity } from './module';

export { getUserActivity } from './application/queries/user-activity';
export { getPlatformActivity } from './application/queries/platform-activity';
export { getAuditTrail } from './application/queries/audit-trail';
export type { RecordActivityCommand } from './application/use-cases/record-activity';
