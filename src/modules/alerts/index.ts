/**
 * alerts — public API, safe to import anywhere.
 *
 * Types, policy constants and error presentation, which the alert form needs in
 * the browser. Composition lives in `./server`, which is `server-only`.
 *
 * The *queries* are not here: they log, and the logger is `server-only`. Same
 * trap `ledger`, `identity`, `announcements`, `presence` and `activity` document.
 */

export type { AlertDirection, AlertStatus } from './domain/price-alert';

export type { AlertError } from './application/errors';
export { presentAlertError } from './application/errors';

export type { AlertBoardDto, PriceAlertDto } from './application/queries/read-alerts';
export type { AlertAction } from './application/use-cases/manage-alerts';
export type { AlertTrigger, EvaluateAlertsResult } from './application/use-cases/evaluate-alerts';
