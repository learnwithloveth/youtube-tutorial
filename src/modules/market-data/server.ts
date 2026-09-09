import 'server-only';

/**
 * Server-side entry point for this module.
 *
 * The composition root lives behind its own path, separate from `index.ts`,
 * because a barrel is imported whole. `createMarketDataModule` reaches the
 * Drizzle repositories and the HTTP feed, both of which are `server-only`; when
 * a Client Component imported so much as a type from the main barrel, that
 * server code came with it and the build failed — correctly.
 *
 * So the module's contract is split by environment rather than by layer:
 *
 *   `@/modules/market-data`        types, DTOs, pure queries and domain
 *                                  services — safe anywhere
 *   `@/modules/market-data/server` composition, which touches infrastructure
 *
 * The split is enforced by the compiler rather than by convention: importing
 * this path from a client module is a build error, not a review comment.
 */

export type { MarketDataModule } from './module';
export { createMarketDataModule } from './module';
