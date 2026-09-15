import { Money } from '@/shared/kernel';

import { TARGET_SCALE } from '../../domain/price-alert';
import type { AlertDependencies } from '../ports';

/**
 * Checks every armed alert against the prices just recorded.
 *
 * ── It runs where new prices land, not on a timer of its own ──────────────────
 * The market-data refresh is the only moment a price *changes* in this system, so
 * it is the only moment an alert can newly be satisfied. Evaluating anywhere else
 * — a cron of its own, a check on page load — is either redundant work or a
 * latency nobody asked for.
 *
 * The honest consequence, which the alerts page now states: an alert fires on the
 * next refresh after the crossing, not the instant it happens. There is no live
 * book feed here to fire from. The page used to claim "under 400 ms of the book
 * crossing your level — not on the next poll", which was the exact opposite of
 * how it works.
 *
 * ── Prices are passed in, not fetched ─────────────────────────────────────────
 * No `PriceSource` port and no import of market-data. The caller already holds the
 * quotes it has just written, and handing them over keeps this module free of any
 * knowledge that market-data exists.
 *
 * ── One failing alert does not stop the rest ──────────────────────────────────
 * Each save is attempted independently. A row that will not write — a concurrent
 * delete, a constraint — must not take the other forty-nine alerts down with it,
 * because this runs unattended and nobody would see the throw.
 */

export interface AlertTrigger {
  readonly alertId: string;
  readonly userId: string;
  readonly symbol: string;
  readonly direction: 'above' | 'below';
  /** Exact decimal strings — what the notification quotes back. */
  readonly target: string;
  readonly price: string;
}

export interface EvaluateAlertsResult {
  readonly examined: number;
  readonly triggered: readonly AlertTrigger[];
  /** Alerts whose symbol had no usable quote in this batch. */
  readonly skipped: number;
}

export type EvaluateAlerts = (input: {
  /** Symbol to exact decimal price. A symbol absent here is simply not evaluated. */
  readonly prices: ReadonlyMap<string, string>;
  readonly limit?: number;
}) => Promise<EvaluateAlertsResult>;

export function createEvaluateAlerts(deps: AlertDependencies): EvaluateAlerts {
  return async function evaluateAlerts({ prices, limit = 500 }) {
    const armed = await deps.alerts.listArmed(limit);
    const now = deps.clock.now();

    const triggered: AlertTrigger[] = [];
    let skipped = 0;

    for (const alert of armed) {
      const quoted = prices.get(alert.symbol.toUpperCase());
      if (quoted === undefined) {
        // No quote for that symbol in this batch. Not an error and not a miss:
        // the alert stays armed and is looked at again on the next refresh.
        skipped += 1;
        continue;
      }

      let price: Money;
      try {
        price = Money.fromDecimalString(quoted, 'USD', TARGET_SCALE);
      } catch {
        skipped += 1;
        continue;
      }

      if (!alert.isSatisfiedBy(price)) continue;

      alert.fire(price, now);
      try {
        await deps.alerts.save(alert);
      } catch {
        // Logged by the caller, which owns the logger. Skipped here rather than
        // reported as triggered: telling somebody an alert fired when the row did
        // not move means it fires again on the next pass.
        skipped += 1;
        continue;
      }

      const snapshot = alert.snapshot();
      triggered.push({
        alertId: snapshot.id,
        userId: snapshot.userId,
        symbol: snapshot.symbol,
        direction: snapshot.direction,
        target: snapshot.target.toTrimmedString(),
        price: (snapshot.triggeredPrice ?? price).toTrimmedString(),
      });
    }

    return { examined: armed.length, triggered, skipped };
  };
}
