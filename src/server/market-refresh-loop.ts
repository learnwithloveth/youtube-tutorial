import 'server-only';

import { refreshTickers } from '@/modules/market-data';
import { createMarketDataModule } from '@/modules/market-data/server';
import { env, hasDatabase } from '@/platform/env';
import { logger } from '@/platform/observability/logger';

import { evaluateAlerts } from './alerts';

/**
 * Pulls quotes on a cadence, so a price is fresh whether or not anybody is looking.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Until now a refresh only happened when a page render noticed a stale quote. That
 * keeps a busy site current and leaves a quiet one wrong: nobody visits for ten
 * minutes, every quote passes `MAX_TICKER_AGE_SECONDS`, and the next person to
 * arrive gets a screen of "Stale" badges — correct, and not what anybody wants to
 * look at. The opportunistic refresh stays as the safety net; this makes freshness
 * the normal case rather than a side effect of traffic.
 *
 * ── Off unless asked for, and only on a server that stays up ─────────────────
 * Set `MARKET_DATA_REFRESH_INTERVAL_SECONDS` to enable it. On a long-running
 * server — `next dev`, a container, a VM — that is all there is to do. On a
 * serverless host it is the wrong mechanism and should be left unset: instances
 * sleep, and a timer inside one is not a schedule. There, point a real cron at
 * `POST /api/market-data/refresh`, which does exactly what this does.
 *
 * ── It does what the endpoint does, because it calls the same code ───────────
 * Fetch, record, then evaluate price alerts — a price changing is the only moment
 * an alert can newly be satisfied, so the two belong on the same beat.
 */

/**
 * Module-level state, kept on `globalThis` so a hot reload cannot start a second
 * loop against the same upstream.
 */
const KEY = Symbol.for('novex.market-refresh-loop');

interface LoopState {
  timer: NodeJS.Timeout | null;
  running: boolean;
}

const state: LoopState = ((globalThis as Record<symbol, unknown>)[KEY] as LoopState | undefined) ?? {
  timer: null,
  running: false,
};
(globalThis as Record<symbol, unknown>)[KEY] = state;

export function startMarketRefreshLoop(): void {
  if (state.timer !== null) return;

  const seconds = env().MARKET_DATA_REFRESH_INTERVAL_SECONDS;
  if (seconds === undefined) return;

  // Nothing to write to. The site renders its catalogue without a database, and
  // this is one of the things that is simply absent in that configuration.
  if (!hasDatabase()) {
    logger.warn({ event: 'ticker_refresh_loop_skipped', module: 'market-data' });
    return;
  }

  state.timer = setInterval(() => void tick(), seconds * 1000);
  // Never hold the process open: a script or a test that imports this must still
  // be able to exit.
  state.timer.unref();

  // Once at boot as well, so a server that has just started does not serve the
  // previous run's prices for the length of one interval.
  void tick();

  logger.info({
    event: 'ticker_refresh_loop_started',
    module: 'market-data',
    intervalSeconds: seconds,
  });
}

async function tick(): Promise<void> {
  // A slow upstream must not stack runs on top of each other.
  if (state.running) return;
  state.running = true;

  try {
    const context = createMarketDataModule();
    const result = await refreshTickers({
      instruments: context.instruments,
      tickers: context.tickers,
      feed: context.feed,
    });

    if (!result.ok) {
      logger.warn({
        event: 'ticker_refresh_failed',
        module: 'market-data',
        reason: result.error.kind,
      });
      return;
    }

    logger.info({ event: 'ticker_refresh', module: 'market-data', ...result.value });

    const evaluated = await evaluateAlerts();
    if (evaluated.triggered > 0) {
      logger.info({
        event: 'alerts_triggered',
        module: 'alerts',
        triggered: evaluated.triggered,
        examined: evaluated.examined,
      });
    }
  } catch (error) {
    // Nothing here may reach the process. An unhandled rejection inside a timer
    // takes the server down, and a feed that is having a bad afternoon must cost
    // a log line and nothing else.
    logger.error({ event: 'ticker_refresh_loop_error', module: 'market-data' }, error);
  } finally {
    state.running = false;
  }
}
