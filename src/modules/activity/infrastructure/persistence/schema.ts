import { index, integer, numeric, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Tables owned by the activity module.
 *
 * Its own Postgres schema rather than an `ac_` name prefix — see
 * `identity/…/schema.ts` for why a real namespace beats a simulated one.
 *
 * Append-only: nothing in this module issues an UPDATE, and the only DELETE is the
 * retention sweep. An audit row that can be edited is not an audit row.
 *
 * ── No foreign key to identity.users, for the reason presence has none ────────
 * `user_id` holds an opaque `UserId`. Identity owns the `identity` schema, and the
 * rule that keeps it extractable is that no other context reads inside it — a
 * foreign key is a read the database enforces on every write. The cost is an unenforced
 * reference and a join done in the application layer; the gain is a module that
 * can be lifted out without a migration in two places.
 *
 * There is a second reason here that does not apply to presence: an audit trail
 * should outlive the thing it describes. `ON DELETE CASCADE` from a user row would
 * mean deleting an account destroys the record of what it did, which is precisely
 * backwards for the one table whose job is to remember.
 */

export const activitySchema = pgSchema('activity');

export const events = activitySchema.table(
  'events',
  {
    id: text('id').primaryKey(),

    /** Opaque UserId. Activity is always attributed — anonymous traffic is `presence`. */
    userId: text('user_id').notNull(),

    kind: text('kind', {
      enum: [
        'page-view',
        'sign-up',
        'sign-in',
        'sign-out',
        'password-reset',
        'verification-sent',
        'email-verified',
        'withdrawal-requested',
        'withdrawal-approved',
        'withdrawal-rejected',
        'deposit-recorded',
        'deposit-rejected',
        'admin-suspended',
        'admin-reinstated',
        'receipt-sent',
        'verification-submitted',
        'verification-approved',
        'verification-rejected',
        'price-alert-triggered',
      ],
      // A Drizzle-level union over a `text` column, not a Postgres enum. That is
      // why adding a kind is a type change and not a migration — and why this list
      // has to be kept in step with `ActivityKind` by hand, which the compiler
      // enforces the moment either one is used against the other.
    }).notNull(),

    /** When it happened, not when it was written. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

    /**
     * Route only, for a page view — never the query string.
     *
     * `normalisePath` strips it before a value reaches here, so a verification
     * token cannot end up in a permanent, year-retained table. That matters more
     * here than in `presence`, whose rows are gone within hours.
     */
    path: text('path'),

    /** Seconds the page was open. Written on departure — see `ActivityEventSnapshot`. */
    durationSeconds: integer('duration_seconds'),

    /**
     * What this event is about — a withdrawal id, a transfer id.
     *
     * Deliberately not a foreign key. The trail outlives what it describes and must
     * survive a row being deleted in another context; a constraint would make the
     * audit record the first casualty of a cleanup elsewhere.
     */
    reference: text('reference'),
    /** A short human summary. Rendered, never parsed. */
    detail: text('detail'),

    locationSource: text('location_source', { enum: ['device', 'edge', 'network'] }),
    locationPrecision: text('location_precision', {
      enum: ['exact', 'city', 'region', 'country'],
    }),
    city: text('city'),
    region: text('region'),
    /** ISO-3166-1 alpha-2. Grouped on by the console, so a column and not a blob. */
    country: text('country'),
    /** `numeric`, so a coordinate round-trips without passing through a float. */
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),

    device: text('device', { enum: ['desktop', 'mobile', 'tablet', 'bot', 'unknown'] }),
    /** Browser family only. The raw user-agent string is never stored. */
    browser: text('browser'),

    /** Keyed digest of the connecting address, never the address. */
    ipDigest: text('ip_digest'),

    /** The browsing context, so a run of events can be tied back to one tab. */
    visitorId: text('visitor_id'),

    /** When we wrote it. Diagnostic: separates a delayed report from a late event. */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The console's main read: one account's history, newest first.
    index('events_user_idx').on(table.userId, table.occurredAt),
    // Narrows that to sign-ins or page views without scanning the account's whole
    // history — the difference between reading a year and reading a filter.
    index('events_user_kind_idx').on(table.userId, table.kind, table.occurredAt),
    // Drives the retention sweep on an index rather than a table scan. Kind first
    // because the two kinds expire on different clocks.
    index('events_kind_time_idx').on(table.kind, table.occurredAt),
  ],
);

export type ActivityEventRow = typeof events.$inferSelect;
export type NewActivityEventRow = typeof events.$inferInsert;
