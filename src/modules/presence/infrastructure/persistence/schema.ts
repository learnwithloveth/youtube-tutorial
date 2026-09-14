import { index, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Tables owned by the presence module.
 *
 * Module-local, prefixed `pr_`. One row per browsing context, overwritten in place
 * — there is no history table, because presence is a question about now and the
 * cheapest way to avoid holding everyone's browsing history is to not write one.
 *
 * ── There is no foreign key to id_users, and that is deliberate ─────────────────
 * `user_id` holds an opaque `UserId` and nothing else. Identity owns `id_users`,
 * and the rule that makes identity extractable into its own service is that no
 * other context reads its tables — a foreign key is a read, enforced by the
 * database on every write. Presence pays for that with an unenforced reference and
 * a join it has to do in the application layer; it buys a module that can be lifted
 * out without a schema migration in two places.
 *
 * ── Why the location columns are not one jsonb blob ────────────────────────────
 * `country` is filtered and grouped on every console refresh, and the source and
 * precision decide how a row renders. Those are queries, not payload. The columns
 * that are genuinely opaque — nothing here — would be the candidates for jsonb.
 */

export const presences = pgTable(
  'pr_presence',
  {
    /**
     * The browsing-context id, minted by the client and validated as a UUID before
     * anything is written. Not a session id and not a user id: a signed-in visitor
     * with three tabs open is three rows, because "which page are they on" has
     * three answers.
     */
    id: text('id').primaryKey(),

    /** Opaque UserId. Null for the signed-out majority of traffic. */
    userId: text('user_id'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** The freshness clock. Everything the console shows is derived from this. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),

    /**
     * Route only — never the query string.
     *
     * `/verify-email` and `/reset-password` carry single-use credentials in their
     * query strings. `normalisePath` strips them before a value reaches here, so an
     * operator reading the live board cannot read a token out of it.
     */
    path: text('path').notNull(),
    pathSince: timestamp('path_since', { withTimezone: true }).notNull(),
    pageViews: integer('page_views').notNull().default(1),

    /** What the client last said about whether anyone is looking at the tab. */
    engagement: text('engagement', { enum: ['engaged', 'backgrounded'] })
      .notNull()
      .default('engaged'),

    locationSource: text('location_source', { enum: ['device', 'edge', 'network'] }),
    locationPrecision: text('location_precision', {
      enum: ['exact', 'city', 'region', 'country'],
    }),

    /**
     * `numeric`, not `double precision`, for the same reason prices are: Drizzle
     * returns it as a string, so a coordinate round-trips without passing through a
     * float in either direction. Six decimal places is about 11cm.
     */
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    /** Radius the device claimed. Only ever set on a `device` fix. */
    accuracyMetres: integer('accuracy_metres'),

    city: text('city'),
    region: text('region'),
    /** ISO-3166-1 alpha-2. */
    country: text('country'),
    timezone: text('timezone'),
    /** When the fix was taken — not when we stored it. Drives staleness. */
    locationObservedAt: timestamp('location_observed_at', { withTimezone: true }),

    device: text('device', { enum: ['desktop', 'mobile', 'tablet', 'bot', 'unknown'] }),
    /** Browser family only. The raw user-agent string is never stored. */
    browser: text('browser'),

    /**
     * Keyed digest of the connecting address, never the address.
     *
     * The rule `id_sessions.ip_hash` follows: an unkeyed hash of an IPv4 address is
     * brute-forceable in seconds, so this is an HMAC under a server-held key. It
     * exists to correlate one visitor across tabs and to see one address driving
     * forty of them, neither of which needs the address itself.
     */
    ipDigest: text('ip_digest'),

    /**
     * Set when the tab said it was closing, rather than the row being deleted.
     *
     * A `pagehide` also fires on every bfcache navigation, so a departure is
     * routinely followed by the same context coming back. Keeping the row lets it
     * resume instead of losing its dwell time and page count.
     */
    departedAt: timestamp('departed_at', { withTimezone: true }),
  },
  (table) => [
    // Covers the console read and the retention sweep, which are the only two
    // queries that exist and both of which range over this column.
    index('pr_presence_last_seen_idx').on(table.lastSeenAt),
    // "Is this account online, and where?" — from a user's row in the console.
    index('pr_presence_user_idx').on(table.userId, table.lastSeenAt),
  ],
);

export type PresenceRow = typeof presences.$inferSelect;
export type NewPresenceRow = typeof presences.$inferInsert;
