import { after } from 'next/server';

import { networkContextFrom, type PresenceReport } from '@/modules/presence/server';
import { logger } from '@/platform/observability/logger';
import { recordVisitorPresence, sweepPresence } from '@/server/presence';

/**
 * Receives one heartbeat from one browsing context.
 *
 * A Route Handler rather than a Server Action, for two reasons. It is a write, and
 * writes do not happen during a render. And it has to be reachable from
 * `navigator.sendBeacon`, which the browser fires as the page is being torn down
 * and which can only post to a URL.
 *
 * ── This endpoint is public, and it has to be ──────────────────────────────────
 * Most visitors to an exchange are signed out, and they are most of the traffic the
 * console exists to watch, so requiring a session here would answer the wrong
 * question. Everything that follows from that is deliberate:
 *
 *  - the body is parsed, never read — every field is untrusted;
 *  - the user id comes from the session cookie, never from the body;
 *  - the response says nothing. Not whether the visitor id was known, not whether
 *    a location was resolved, not whether a database exists. An endpoint anyone can
 *    call is an oracle if it answers questions, and this one answers none.
 *
 * ── What is deliberately absent ────────────────────────────────────────────────
 * There is no rate limiting, which is the same gap ADR-0004 records for sign-in and
 * has the same answer: it belongs in one shared place rather than re-implemented
 * here. The exposure is bounded meanwhile — a report can only write a row keyed by
 * a UUID the caller already holds, the body is capped, and the path is stripped to
 * a route.
 */

export const dynamic = 'force-dynamic';

/**
 * Largest body accepted.
 *
 * A heartbeat is a few hundred bytes. The cap exists so a public endpoint cannot be
 * made to buffer a megabyte per request, and it is checked before parsing rather
 * than after.
 */
const MAX_BODY_BYTES = 2_048;

/**
 * How often a beat also triggers the retention sweep.
 *
 * Roughly one in five hundred, which at any real traffic level is several times a
 * minute and at no traffic costs nothing. A cron entry would be tidier; this needs
 * no scheduler to be configured for retention to actually happen, which matters
 * because an un-run sweep is personal data kept past its justification.
 */
const SWEEP_ODDS = 500;

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let report: PresenceReport;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    report = JSON.parse(raw) as PresenceReport;
  } catch {
    // Malformed JSON from a public endpoint is background noise, not an incident.
    return new Response(null, { status: 400 });
  }

  if (typeof report !== 'object' || report === null) {
    return new Response(null, { status: 400 });
  }

  const outcome = await recordVisitorPresence({
    report,
    network: networkContextFrom(request.headers),
  });

  if (outcome.kind === 'rejected') {
    // 409 for a context id that belongs to another account: the client answers by
    // minting a new one, which is exactly what should happen after a sign-out.
    // 400 for anything else. Neither says which field was wrong.
    const status = outcome.error.kind === 'visitor-unknown' ? 409 : 400;
    return new Response(null, { status, headers: NO_STORE });
  }

  if (Math.random() * SWEEP_ODDS < 1) {
    // After the response, so retention never costs a visitor latency.
    after(async () => {
      try {
        const removed = await sweepPresence();
        if (removed > 0) {
          logger.info({ event: 'presence_swept', module: 'presence', removed });
        }
      } catch (error) {
        logger.warn({ event: 'presence_sweep_failed', module: 'presence' }, error);
      }
    });
  }

  if (outcome.kind === 'not-configured' || outcome.kind === 'unavailable') {
    // Accepted and discarded. The site runs without a database by design, and a
    // visitor must not be able to tell whether this deployment has one — nor
    // whether it is currently reachable, which is why a failed write answers
    // exactly as an absent one does.
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  return Response.json(
    { nextBeatMs: outcome.result.nextBeatMs },
    { status: 200, headers: NO_STORE },
  );
}

const NO_STORE = { 'cache-control': 'no-store' } as const;
