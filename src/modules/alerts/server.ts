import 'server-only';

/**
 * Server-side entry point for the alerts module.
 *
 * A barrel is imported *whole*, so exporting `registerAlerts` from `index.ts`
 * would drag the database client into any Client Component that wanted a
 * `PriceAlertDto` — and the build would fail, correctly.
 */

export type { AlertsModule, RegisterAlertsOptions } from './module';
export { registerAlerts } from './module';

export { getAlertBoard, getLastRead } from './application/queries/read-alerts';
export type { CreateAlertCommand, MoveAlertCommand } from './application/use-cases/manage-alerts';
