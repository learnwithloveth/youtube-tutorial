import 'server-only';

import { inArray, sql } from 'drizzle-orm';

import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { BasisPoints, Money } from '@/shared/kernel';

import type { InstrumentRepository, TickerRepository } from '../../application/ports';
import type { AssetSymbol } from '../../domain/asset-symbol';
import type { Instrument } from '../../domain/instrument';
import { Ticker, type TickerSnapshot } from '../../domain/ticker';
import {
  INSTRUMENT_BY_SLUG,
  INSTRUMENT_BY_SYMBOL,
  LISTED_INSTRUMENTS,
} from '../catalogue/instrument-catalogue';
import { tickers, type TickerRow } from './schema';

/**
 * Adapters. Everything that knows about Postgres and Drizzle lives here, behind
 * the interfaces the application layer declared.
 */

export class CatalogueInstrumentRepository implements InstrumentRepository {
  async listListed(): Promise<Instrument[]> {
    return LISTED_INSTRUMENTS.filter((instrument) => instrument.listed);
  }

  async findBySlug(slug: string): Promise<Instrument | null> {
    return INSTRUMENT_BY_SLUG.get(slug) ?? null;
  }
}

export class DrizzleTickerRepository implements TickerRepository {
  /**
   * Latest observation per symbol.
   *
   * A database failure returns an empty map rather than propagating. That is a
   * deliberate reliability decision on this read path: with no rows, every
   * market resolves to `unavailable`, the page renders its full catalogue with
   * empty price cells, and the visitor sees a working site with no prices —
   * which is true. Letting the error escape would instead take down the home
   * page, the asset pages and the build, over a dependency that only supplies
   * one column of one table.
   *
   * The failure is logged at error level, so this degrades visibly rather than
   * silently.
   */
  async latestFor(symbols: readonly AssetSymbol[]): Promise<Map<string, Ticker>> {
    const handle = db();
    if (!handle || symbols.length === 0) return new Map();

    let rows: (TickerRow)[];
    try {
      rows = await handle
        .select()
        .from(tickers)
        .where(
          inArray(
            tickers.symbol,
            symbols.map((symbol) => symbol.value),
          ),
        );
    } catch (error) {
      logger.error(
        { event: 'ticker_read_failed', module: 'market-data', symbols: symbols.length },
        error,
      );
      return new Map();
    }

    const result = new Map<string, Ticker>();
    for (const row of rows) {
      const ticker = toDomain(row);
      // A row for a symbol we no longer list is skipped rather than surfaced;
      // delisting should not resurrect an asset on the site.
      if (ticker) result.set(ticker.symbol.value, ticker);
    }
    return result;
  }

  async record(snapshots: readonly TickerSnapshot[]): Promise<void> {
    const handle = db();
    if (!handle || snapshots.length === 0) return;

    const rows = snapshots.map((snapshot) => ({
      symbol: snapshot.symbol.value,
      price: snapshot.price.toDecimalString(),
      currency: snapshot.price.currency,
      priceScale: snapshot.price.scale,
      change24hBp: snapshot.change24h.value,
      change7dBp: snapshot.change7d.value,
      marketCap: snapshot.marketCap?.toDecimalString() ?? null,
      volume24h: snapshot.volume24h?.toDecimalString() ?? null,
      circulatingSupply: snapshot.circulatingSupply?.toString() ?? null,
      sparkline: snapshot.sparkline ? [...snapshot.sparkline] : null,
      observedAt: snapshot.observedAt,
      recordedAt: new Date(),
    }));

    // One statement for the whole batch. Upsert on the natural key so the table
    // holds exactly one current row per symbol and never grows unbounded.
    await handle
      .insert(tickers)
      .values(rows)
      .onConflictDoUpdate({
        target: tickers.symbol,
        set: {
          price: sqlExcluded('price'),
          currency: sqlExcluded('currency'),
          priceScale: sqlExcluded('price_scale'),
          change24hBp: sqlExcluded('change_24h_bp'),
          change7dBp: sqlExcluded('change_7d_bp'),
          marketCap: sqlExcluded('market_cap'),
          volume24h: sqlExcluded('volume_24h'),
          circulatingSupply: sqlExcluded('circulating_supply'),
          sparkline: sqlExcluded('sparkline'),
          observedAt: sqlExcluded('observed_at'),
          recordedAt: sqlExcluded('recorded_at'),
        },
      });
  }
}

/** In-memory ticker store, for tests and for running with no database. */
export class InMemoryTickerRepository implements TickerRepository {
  private readonly store = new Map<string, Ticker>();

  async latestFor(symbols: readonly AssetSymbol[]): Promise<Map<string, Ticker>> {
    const result = new Map<string, Ticker>();
    for (const symbol of symbols) {
      const ticker = this.store.get(symbol.value);
      if (ticker) result.set(symbol.value, ticker);
    }
    return result;
  }

  async record(snapshots: readonly TickerSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      this.store.set(snapshot.symbol.value, Ticker.create(snapshot));
    }
  }
}

/**
 * Maps a stored row back to the domain.
 *
 * Returns null when the row cannot become a valid `Ticker` — an unlisted symbol,
 * or a value the domain rejects. Dropping the row is right: one corrupt record
 * should cost that asset its price cell, not take down the market table.
 */
function toDomain(row: TickerRow): Ticker | null {
  const instrument = INSTRUMENT_BY_SYMBOL.get(row.symbol);
  if (!instrument) return null;

  try {
    return Ticker.create({
      symbol: instrument.symbol,
      // `numeric` arrives as a string, so the value reaches Money without ever
      // being a float.
      price: Money.fromDecimalString(row.price, row.currency, row.priceScale),
      change24h: BasisPoints.of(row.change24hBp),
      change7d: BasisPoints.of(row.change7dBp),
      marketCap: row.marketCap ? Money.fromDecimalString(row.marketCap, row.currency, 2) : null,
      volume24h: row.volume24h ? Money.fromDecimalString(row.volume24h, row.currency, 2) : null,
      circulatingSupply: row.circulatingSupply ? BigInt(row.circulatingSupply) : null,
      sparkline: row.sparkline ?? null,
      observedAt: row.observedAt,
    });
  } catch {
    return null;
  }
}

/** `excluded.<column>` — the proposed row in an ON CONFLICT DO UPDATE. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
