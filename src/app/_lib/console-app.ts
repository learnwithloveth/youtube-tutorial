import type { UserRole } from '@/modules/identity';

/**
 * The operations console as an installable app — the console, and nothing else.
 *
 * ── Only the console ──────────────────────────────────────────────────────────
 * The manifest is linked from the console's layout alone, so the customer site
 * never offers to install. And the app's scope stops at `/admin`: a link out of
 * the console opens in the browser, not inside the app's window.
 *
 * ── No trailing slash ─────────────────────────────────────────────────────────
 * A scope is a prefix of the URL. `/admin/` would leave out `/admin` itself — the
 * console's front page and the app's start URL — because Next redirects the
 * trailing slash away. The cost is that `/admin.webmanifest` and anything else
 * starting with those six characters is technically inside; nothing is navigated
 * to there.
 *
 * ── Why push notifications care where it ends ─────────────────────────────────
 * Chrome attributes a notification to an installed app by the scope of the
 * service worker that showed it. On Windows that decides which switch governs the
 * notification: the app's own entry in Settings → System → Notifications, or
 * Chrome's. A worker registered at the site's root is outside this scope, so an
 * operator's notifications would stay Chrome's even with the console installed.
 * An operator's registration therefore lives at the console's scope; a
 * customer's, at the root. See `pushScopeFor`.
 */
export const CONSOLE_APP = {
  scope: '/admin',
  manifest: '/admin.webmanifest',
} as const;

/**
 * Where an account's push registration lives: the console's scope for an
 * operator, the site's root for everybody else.
 *
 * Decided by role rather than by the page doing the registering, because a
 * browser holds one registration and the Firebase SDK one token per site. An
 * operator also visits customer pages; if each area registered at its own scope,
 * every move between the two would swap the token and leave a subscription behind.
 */
export function pushScopeFor(role: UserRole): string {
  return role === 'admin' ? CONSOLE_APP.scope : '/';
}
