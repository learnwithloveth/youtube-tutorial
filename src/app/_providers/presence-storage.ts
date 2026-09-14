/**
 * Storage keys and the endpoint for presence reporting.
 *
 * ── Why this is its own directive-free module ──────────────────────────────────
 * The same reason `theme-storage.ts` is. A value imported from a `'use client'`
 * module into server code is a *reference*, not the value, and the failure is
 * silent: the earlier version of the theme code generated
 * `localStorage.getItem(undefined)` and nobody noticed until the theme stopped
 * persisting. Constants shared across the boundary live in a module with no
 * directive at all, so both sides get the string.
 */

/**
 * Where the browsing-context id is kept.
 *
 * `sessionStorage`, not a cookie and not `localStorage`, and each of those is a
 * decision:
 *
 *  - not a cookie, because a cookie is sent on every request to every route and
 *    would need a consent banner in most of the world to identify a visitor across
 *    one. This id never leaves the tab except in the heartbeat body.
 *  - not `localStorage`, because that is shared between tabs and survives the
 *    browser closing. Presence is per-tab — "which page are they on" has one answer
 *    per tab — and an id that outlives the visit would be a tracking identifier
 *    rather than a session one.
 *
 * `sessionStorage` also survives a reload, which is what keeps a refresh from
 * resetting someone's dwell time and page count.
 */
export const VISITOR_ID_KEY = 'novex.presence.visitor';

/**
 * Whether the visitor asked us to use their precise location.
 *
 * `localStorage`, because this one *should* outlive the tab: having granted
 * location once, being asked again in every new tab would be the worst of both
 * worlds. It records our own intent to use the permission, which is not the same
 * thing as the browser's permission state — the browser is always the authority on
 * whether we may, and this only says whether we should ask it.
 */
export const PRECISE_LOCATION_KEY = 'novex.presence.precise';

export const PRESENCE_ENDPOINT = '/api/presence';
