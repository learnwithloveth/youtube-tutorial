import 'server-only';

/**
 * Server-side entry point for the identity module.
 *
 * The composition root reaches the Drizzle repositories, Node's crypto, and the
 * SMTP transport. A barrel is imported *whole*, so if `registerIdentity` were
 * exported from `index.ts`, a Client Component importing `PASSWORD_MIN_LENGTH`
 * for a strength meter would drag the database client and the mailer into the
 * browser bundle — and the build would fail, correctly.
 *
 *   `@/modules/identity`        types, errors, policy constants — safe anywhere
 *   `@/modules/identity/server` composition, which touches infrastructure
 */

export type { IdentityModule, RegisterIdentityOptions } from './module';
export { registerIdentity, SESSION_COOKIE_NAME } from './module';
export type { ResolvedSession } from './application/use-cases/resolve-session';
