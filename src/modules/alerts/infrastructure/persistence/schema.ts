import { index, integer, numeric, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Tables owned by the alerts module.
 *
 * Its own Postgres schema, like every other context. Note what is *not* here: no
 * notifications table. The feed is a view over `activity.events`, which already
 * records every event worth telling a customer about — duplicating those rows into
 * a second table would mean two writes on one path, kept in sync forever. What
 * cannot be derived is how far somebody has read, and that is the second table.
 */
export const alertsSchema = pgSchema('alerts');

export const priceAlerts = alertsSchema.table(
  'price_alerts',
  {
    id: text('id').primaryKey(),
    /** No foreign key to identity.users: a module's tables are its own. */
    userId: text('user_id').notNull(),

    symbol: text('symbol').notNull(),
    direction: text('direction', { enum: ['above', 'below'] }).notNull(),

    /**
     * `numeric`, never `double precision`.
     *
     * The comparison this column exists for is the whole feature. A float target
     * of 0.00002341 does not round-trip, and the alert fires at a level the
     * customer never chose — see ADR 0002.
     */
    target: numeric('target', { precision: 38, scale: 8 }).notNull(),

    status: text('status', { enum: ['armed', 'triggered', 'muted'] })
      .notNull()
      .default('armed'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
    /** The price that satisfied it, so the notification can state a fact. */
    triggeredPrice: numeric('triggered_price', { precision: 38, scale: 8 }),

    version: integer('version').notNull().default(0),
  },
  (table) => [
    /* The customer's own page. */
    index('price_alerts_user_idx').on(table.userId, table.createdAt),
    /*
     * The evaluator, which runs on every market-data refresh and must never
     * sequentially scan this table to find the armed rows.
     */
    index('price_alerts_armed_idx').on(table.status, table.symbol),
    /*
     * One alert per (account, symbol, direction, target).
     *
     * Enforced here as well as in the use case, because the use case's read of
     * existing alerts and its write are not atomic: two submissions racing both
     * pass the check, and only the index can make exactly one of them succeed.
     */
    uniqueIndex('price_alerts_unique').on(
      table.userId,
      table.symbol,
      table.direction,
      table.target,
    ),
  ],
);

/** How far one account has read its notification feed. One row per account. */
export const notificationReads = alertsSchema.table('notification_reads', {
  userId: text('user_id').primaryKey(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
});

export type PriceAlertRow = typeof priceAlerts.$inferSelect;
