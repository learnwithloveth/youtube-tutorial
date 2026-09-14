import 'server-only';

/**
 * Server-side entry point for the presence module.
 *
 * The composition root reaches the Drizzle repository, Node's crypto and an
 * outbound HTTP client. A barrel is imported *whole*, so if `registerPresence`
 * were exported from `index.ts`, the browser reporter importing
 * `HEARTBEAT_INTERVAL_MS` would drag the database client into the client bundle —
 * and the build would fail, correctly.
 *
 *   `@/modules/presence`        types, DTOs, cadence constants — safe anywhere
 *   `@/modules/presence/server` composition, which touches infrastructure
 *
 * `listLiveActivity` is here rather than in the safe barrel for a subtler version
 * of the same reason: it is a pure function over ports, but it logs through
 * `@/platform/observability/logger`, which is itself `server-only`. Its callers
 * are a Server Component and a route handler, so nothing is lost.
 */

export type { PresenceModule, RegisterPresenceOptions } from './module';
export { registerPresence } from './module';

export { listLiveActivity } from './application/queries/live-activity';

export type { NetworkContext } from './application/ports';
export { networkContextFrom } from './infrastructure/http/request-network';

export type {
  PresenceReport,
  RecordPresenceInput,
  RecordPresenceResult,
} from './application/use-cases/record-presence';
