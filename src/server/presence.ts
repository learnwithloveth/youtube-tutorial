import 'server-only';

import { cache } from 'react';

import type { UserSummaryDto } from '@/modules/identity';
import type { ActiveVisitorDto, LiveActivityDto, PresenceError } from '@/modules/presence';
import {
  listLiveActivity,
  registerPresence,
  type NetworkContext,
  type PresenceModule,
  type PresenceReport,
  type RecordPresenceResult,
} from '@/modules/presence/server';
import { db } from '@/platform/db/client';
import { geoLookupConfig, sessionSecret } from '@/platform/env';
import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import { getCurrentUser, identity } from './auth';

/**
 * The application's facade over live presence.
 *
 * ── This is where the cross-module join happens ────────────────────────────────
 * Presence holds a `UserId` and never reads `id_users`; identity owns those rows
 * and never hears of presence. Neither module can produce "who is on the pricing
 * page" with an email attached — only something allowed to call both can, and this
 * is that something. Doing it here rather than with a database join is what keeps
 * either module liftable into its own service without a schema change in two
 * places.
 *
 * ── Everything degrades ────────────────────────────────────────────────────────
 * Presence is telemetry. Nothing on the site depends on it, so no failure in it is
 * allowed to be visible anywhere else: with no database configured the module is
 * simply absent, heartbeats are accepted and discarded, and the console says the
 * board is unavailable instead of throwing.
 */

/**
 * One module instance per request.
 *
 * Not a singleton, for the reason `identity` is not: a module-level instance would
 * capture a database handle across requests. `cache` makes repeated calls within
 * one render or one handler return the same instance rather than rebuilding the
 * HMAC key and the resolver chain each time.
 *
 * Null when no database is configured. The marketing site renders without one and
 * a heartbeat must not be the thing that changes that.
 */
export const presence = cache((): PresenceModule | null => {
  const handle = db();
  if (!handle) return null;

  const lookup = geoLookupConfig();
  return registerPresence({
    db: handle,
    digestSecret: sessionSecret(),
    ...(lookup ? { lookup } : {}),
  });
});

export type RecordPresenceOutcome =
  | { readonly kind: 'recorded'; readonly result: RecordPresenceResult }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rejected'; readonly error: PresenceError };

/**
 * Records one heartbeat.
 *
 * The user id is resolved here, from the session, and passed in. The report cannot
 * carry one: a client that could name its own user would be able to put any
 * account on the live board, in any city, by typing an id.
 *
 * ── Infrastructure failure is caught here, not propagated ──────────────────────
 * The module follows the house rule and throws on a database it cannot reach —
 * that is a fault, not a value. This layer is where the rule stops, because of who
 * is calling: an open tab, a few times a minute, on every page of the site. Letting
 * that throw would turn one unreachable database into a 500 for every visitor on
 * the site several times a minute, a stack trace per beat in the logs, and a
 * console error in every browser — all of it for telemetry that nothing on the page
 * depends on.
 *
 * It is logged once per occurrence and reported as `unavailable`. The read path
 * already degrades the same way, and its `degraded` flag is what tells an operator
 * the board is empty because presence is broken rather than because nobody is here.
 */
export async function recordVisitorPresence(input: {
  report: PresenceReport;
  network: NetworkContext;
}): Promise<RecordPresenceOutcome> {
  const context = presence();
  if (context === null) return { kind: 'not-configured' };

  try {
    const user = await getCurrentUser();

    const result = await context.recordPresence({
      report: input.report,
      userId: user ? (user.id as UserId) : null,
      network: input.network,
    });

    return result.ok
      ? { kind: 'recorded', result: result.value }
      : { kind: 'rejected', error: result.error };
  } catch (error) {
    logger.warn({ event: 'presence_write_failed', module: 'presence' }, error);
    return { kind: 'unavailable' };
  }
}

/** Deletes presence rows past their retention window. See `sweepPresence`. */
export async function sweepPresence(): Promise<number> {
  const context = presence();
  return context === null ? 0 : context.sweepPresence();
}

/** A visitor with the account resolved, when there is one to resolve. */
export interface LiveVisitorView extends ActiveVisitorDto {
  readonly account: UserSummaryDto | null;
}

export interface LiveActivityView extends Omit<LiveActivityDto, 'visitors'> {
  readonly visitors: readonly LiveVisitorView[];
}

const UNAVAILABLE: LiveActivityView = {
  visitors: [],
  pages: [],
  countries: [],
  totals: { active: 0, idle: 0, signedIn: 0, anonymous: 0, located: 0, unlocated: 0 },
  observedAt: new Date(0).toISOString(),
  degraded: true,
};

/**
 * Who is on the site right now, with accounts attached.
 *
 * Deduplicated per request so the console's header counts and its table cost one
 * read between them rather than two. It is per-request memoisation and not a cache
 * with a lifetime — a live board served from the previous request's memory would be
 * the one thing it must never be.
 */
export const getLiveActivity = cache(
  async (options: { limit?: number } = {}): Promise<LiveActivityView> => {
    const context = presence();
    if (context === null) return { ...UNAVAILABLE, observedAt: new Date().toISOString() };

    const snapshot = await listLiveActivity(context.dependencies, options);

    const ids = [
      ...new Set(
        snapshot.visitors
          .map((visitor) => visitor.userId)
          .filter((id): id is string => id !== null),
      ),
    ] as UserId[];

    // Resolved in one lookup, not one per row: a board of two hundred visitors
    // would otherwise be two hundred round trips behind a single page render.
    const accounts = await describeAccounts(ids);

    return {
      ...snapshot,
      visitors: snapshot.visitors.map((visitor) => ({
        ...visitor,
        account: visitor.userId ? (accounts.get(visitor.userId as UserId) ?? null) : null,
      })),
    };
  },
);

/**
 * Resolves ids to accounts, tolerating an identity outage.
 *
 * A failure here costs the email column and nothing else — the board still shows
 * where everyone is and what they are looking at. Letting it throw would mean an
 * identity problem blanked the operations console at the moment someone opened it
 * to find out what was wrong.
 */
async function describeAccounts(ids: readonly UserId[]): Promise<Map<UserId, UserSummaryDto>> {
  if (ids.length === 0) return new Map();

  try {
    return await identity().describeUsers(ids);
  } catch {
    return new Map();
  }
}
