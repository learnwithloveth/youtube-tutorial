import { after } from 'next/server';

import { refreshTickers } from '@/modules/market-data';
import { createMarketDataModule } from '@/modules/market-data/server';
import { env } from '@/platform/env';
import { evaluateAlerts } from '@/server/alerts';
import { logger } from '@/platform/observability/logger';

/**
 * Pulls fresh quotes from the upstream feed and records them.
 *
 * A Route Handler rather than a page render, because this is a *write*. Pages
 * read; nothing that mutates state belongs on a path a crawler can walk.
 * Intended to be called on a schedule — a cron job, roughly once a minute.
 *
 * Authorised by a shared secret compared in constant time. A plain `===` on a
 * token leaks its length and prefix through timing, which is a real if slow
 * attack against an endpoint that anyone can call repeatedly.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const configured = env().MARKET_DATA_REFRESH_TOKEN;
  if (!configured) {
    logger.error({ event: 'refresh_not_configured', module: 'market-data' });
    return json({ error: 'Refresh is not configured.' }, 503);
  }

  const presented = bearerToken(request.headers.get('authorization'));
  if (!presented || !timingSafeEqual(presented, configured)) {
    // No detail about why: a caller without the token learns only that it failed.
    return json({ error: 'Unauthorized.' }, 401);
  }

  const context = createMarketDataModule();
  const started = Date.now();

  const result = await refreshTickers({
    instruments: context.instruments,
    tickers: context.tickers,
    feed: context.feed,
  });

  if (!result.ok) {
    logger.error({
      event: 'refresh_failed',
      module: 'market-data',
      reason: result.error.kind,
    });
    // 503, not 500: the upstream is unavailable, we are not broken, and the
    // scheduler should retry rather than page someone.
    return json({ error: result.error.kind }, 503);
  }

  // Logging after the response is sent keeps it off the caller's latency.
  after(() => {
    logger.info({
      event: 'refresh_succeeded',
      module: 'market-data',
      durationMs: Date.now() - started,
      ...result.value,
    });
  });

  /*
   * Price alerts are evaluated here, after the write, because this is the only
   * moment a price changes — so it is the only moment an alert can newly be
   * satisfied. Checking anywhere else is either redundant work or a delay.
   *
   * In `after()` so the scheduler's request is not held open for it, and wrapped
   * so a failure is a logged line rather than a refresh that reports failure
   * after the prices it fetched have already been stored.
   */
  after(async () => {
    try {
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
      logger.error({ event: 'alert_evaluation_failed', module: 'alerts' }, error);
    }
  });

  return json(result.value, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/**
 * Compares two strings without short-circuiting on the first difference.
 *
 * Length is compared first and does leak — that is unavoidable and not useful
 * to an attacker who does not already know the secret's length is fixed by our
 * own configuration.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}
