import { index, integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Physical schema.
 *
 * Two column choices carry the money discipline down to the storage layer:
 *
 * `numeric` for amounts, never `double precision`. Postgres `numeric` is an
 * exact decimal type; a float column would reintroduce, at the storage layer,
 * precisely the representation error `Money` exists to avoid. Drizzle hands
 * `numeric` back as a *string*, which is what `Money.fromDecimalString` wants,
 * so the value never passes through a JavaScript number on the way in or out.
 *
 * `integer` basis points for rates, matching `BasisPoints` exactly.
 *
 * Only observations are stored. Instruments live in the code catalogue — see
 * `infrastructure/catalogue` for why — so there is no instruments table and no
 * foreign key to one; `symbol` is the natural key, validated against the
 * catalogue before anything is written.
 */

export const tickers = pgTable(
  'tickers',
  {
    /** Asset symbol, uppercase. One row per symbol: the latest observation. */
    symbol: text('symbol').primaryKey(),

    price: numeric('price', { precision: 38, scale: 18 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    /** Decimal places the price was quoted at, preserved from the instrument. */
    priceScale: integer('price_scale').notNull(),

    change24hBp: integer('change_24h_bp').notNull(),
    change7dBp: integer('change_7d_bp').notNull(),

    marketCap: numeric('market_cap', { precision: 38, scale: 2 }),
    volume24h: numeric('volume_24h', { precision: 38, scale: 2 }),
    circulatingSupply: numeric('circulating_supply', { precision: 38, scale: 0 }),

    /**
     * The 7-day shape, normalised to 0..1. `jsonb` rather than a child table:
     * it is read only as a whole, written only as a whole, and never queried
     * by element, so a row per point would buy nothing and cost a join.
     */
    sparkline: jsonb('sparkline').$type<number[]>(),

    /** When the upstream observed this quote — the freshness clock. */
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    /** When we wrote it. Diagnostic: separates feed lag from our own. */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tickers_observed_at_idx').on(table.observedAt)],
);

export type TickerRow = typeof tickers.$inferSelect;
export type NewTickerRow = typeof tickers.$inferInsert;
