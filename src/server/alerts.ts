import 'server-only';

import { cache } from 'react';

import type { AlertBoardDto } from '@/modules/alerts';
import {
  getAlertBoard,
  getLastRead,
  registerAlerts,
  type AlertsModule,
} from '@/modules/alerts/server';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import { recordActivity } from './activity';
import { getMarkets } from './market-data';

/**
 * The application's alerts facade.
 *
 * ── The one place that knows alerts and market-data both exist ────────────────
 * The alerts module has no price source and no import of market-data: its
 * evaluator takes quotes as an argument. This file supplies them. That is the same
 * seam the ledger's `PriceOracle` uses, done without a port because the caller
 * already holds the prices.
 */

export const alerts = cache((): AlertsModule | null => {
  const database = db();
  if (database === null) return null;
  return registerAlerts({ db: database });
});

export interface AlertBoardView extends AlertBoardDto {
  readonly unavailable: boolean;
  /** Current price per symbol, for the distance column. Absent when unquoted. */
  readonly prices: Readonly<Record<string, string>>;
}

const UNAVAILABLE: AlertBoardView = {
  alerts: [],
  armed: 0,
  muted: 0,
  triggered: 0,
  degraded: false,
  unavailable: true,
  prices: {},
};

export const getAlertsFor = cache(async (userId: UserId): Promise<AlertBoardView> => {
  const context = alerts();
  if (context === null) return UNAVAILABLE;

  // In parallel and independently: a market-data outage should cost the distance
  // column, not the alerts themselves. `getMarkets` already degrades to unavailable
  // quotes rather than throwing, so this is belt and braces on the shape.
  const [board, markets] = await Promise.all([
    getAlertBoard(context.dependencies, userId),
    getMarkets(),
  ]);

  const prices: Record<string, string> = {};
  for (const market of markets) {
    if (market.quote.state !== 'unavailable') prices[market.symbol] = market.quote.price;
  }

  return { ...board, prices, unavailable: false };
});

/** Symbols a customer may set an alert on — exactly what this platform quotes. */
export const getAlertableSymbols = cache(async (): Promise<string[]> => {
  const markets = await getMarkets();
  return markets.map((market) => market.symbol);
});

export async function getNotificationsReadAt(userId: UserId): Promise<Date | null> {
  const context = alerts();
  if (context === null) return null;
  return getLastRead(context.dependencies, userId);
}

/**
 * Evaluates every armed alert against the prices just recorded.
 *
 * ── Called from the refresh endpoint, after the write ─────────────────────────
 * A price only changes there, so that is the only moment an alert can newly be
 * satisfied. Running it anywhere else is either redundant or a delay.
 *
 * ── A trigger is recorded on the customer's activity trail ────────────────────
 * Which is also their notification feed — the feed is a view over that table, so
 * writing the event is what makes the alert appear in the bell. Best-effort, like
 * every other activity write: an alert that fired must not be un-fired because an
 * insert timed out, and the alert row has already moved.
 */
export async function evaluateAlerts(): Promise<{ triggered: number; examined: number }> {
  const context = alerts();
  if (context === null) return { triggered: 0, examined: 0 };

  const markets = await getMarkets();
  const prices = new Map<string, string>();
  for (const market of markets) {
    if (market.quote.state === 'live') prices.set(market.symbol.toUpperCase(), market.quote.price);
  }

  // Live quotes only. Firing a customer's alert off a stale price tells them a
  // market reached a level it may have left hours ago, and "never invent a price"
  // covers acting on one as much as printing it.
  if (prices.size === 0) return { triggered: 0, examined: 0 };

  const result = await context.evaluate({ prices });

  for (const trigger of result.triggered) {
    try {
      await recordActivity({
        userId: trigger.userId as UserId,
        kind: 'price-alert-triggered',
        reference: trigger.alertId,
        detail: `${trigger.symbol} ${trigger.direction} ${trigger.target} — at ${trigger.price}`,
        location: null,
        agent: null,
        ipDigest: null,
      });
    } catch {
      logger.warn({ event: 'alert_trail_write_skipped', module: 'alerts' });
    }
  }

  if (result.triggered.length > 0 || result.skipped > 0) {
    logger.info({
      event: 'alerts_evaluated',
      module: 'alerts',
      examined: result.examined,
      triggered: result.triggered.length,
      skipped: result.skipped,
    });
  }

  return { triggered: result.triggered.length, examined: result.examined };
}
