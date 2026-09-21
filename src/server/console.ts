import 'server-only';

import { cache } from 'react';

import type { PlatformActivityDto } from '@/modules/activity';
import { getPlatformActivity } from '@/modules/activity/server';
import type { UserStatus } from '@/modules/identity';
import type { DecisionDto, OperationsSummaryDto } from '@/modules/ledger';
import { getOperationsSummary } from '@/modules/ledger/server';
import { getVerificationQueue } from '@/modules/identity/server';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { activity } from './activity';
import { identity } from './auth';
import { ledger } from './ledger';
import { getMarkets } from './market-data';
import { getOpenSupportCount } from './support';
import { getLiveActivity } from './presence';
import { getRiskConsole } from './risk';

/**
 * Everything the command centre shows, assembled from four contexts.
 *
 * ── This screen replaced a fixture ─────────────────────────────────────────────
 * It used to show a 24-hour trading volume of $41.2B, 41.2 million verified
 * traders, a median first reply of 88 seconds, six services with uptime to three
 * decimal places, and an audit log of invented operators. All of it came from a
 * seeded random-number generator, and none of it could ever have been true: this
 * platform has no matching engine, no support desk and no uptime measurement.
 *
 * Those numbers are gone rather than reimplemented. The rule is the one the
 * approvals queue already applies to its risk scores — a figure on an operations
 * console is read as a measurement, and a plausible-looking constant is worse than
 * an absence, because an absence cannot be acted on by mistake.
 *
 * What replaced them is smaller and counted: what is waiting for a human, what it
 * is worth, who has been using the platform, and which of this application's own
 * dependencies are answering.
 *
 * ── Composition lives here because no module may do it ─────────────────────────
 * The ledger holds an opaque `UserId` and has never heard of an email address;
 * identity has never heard of a balance; presence and activity know neither. Their
 * mutual ignorance is what makes any of them extractable, so the joining happens
 * above all four — the same arrangement `users.ts` and `transactions.ts` use.
 */

export interface ServiceCheckDto {
  readonly name: string;
  readonly state: 'operational' | 'degraded' | 'unavailable';
  /**
   * What the state is based on.
   *
   * Never an uptime percentage. Nothing in this application measures uptime, and a
   * number to three decimal places is the most convincing thing on a status
   * board — which is exactly why inventing one is the worst thing to do to it.
   */
  readonly detail: string;
}

export interface ConsoleOverviewDto {
  readonly operations: OperationsSummaryDto;
  readonly activity: PlatformActivityDto;
  readonly customers: {
    readonly total: number;
    readonly byStatus: readonly { status: UserStatus; total: number }[];
    readonly degraded: boolean;
  };
  readonly live: {
    readonly active: number;
    readonly idle: number;
    readonly signedIn: number;
    readonly degraded: boolean;
  };
  readonly services: readonly ServiceCheckDto[];
  /** Decisions with the operator resolved to an address, where the lookup worked. */
  readonly decisionActors: Readonly<Record<string, string>>;
}

const ACTIVITY_DAYS = 30;

/**
 * Just the queue sizes, for the console's rail badge.
 *
 * Separate from `getConsoleOverview` and much cheaper, because the layout runs it
 * on *every* admin page — two grouped counts rather than the overview's six reads.
 * On the command centre both run, and `cache` keeps each to one round trip.
 *
 * Degrades to zero rather than throwing: a badge is not worth a 500, and an
 * operator who sees no badge will open the queue anyway.
 */
export const getPendingQueueCounts = cache(
  async (): Promise<{
    approvals: number;
    tickets: number;
    kyc: number;
    surveillance: number;
  }> => {
    const context = ledger();

    // `allSettled` across three contexts: support being unconfigured, the ledger
    // unreachable, or the risk scan failing should cost that badge rather than the
    // others — and rejecting in parallel with `all` leaves the losers unattached,
    // which Node terminates for.
    const [ledgerCounts, tickets, kyc, risk] = await Promise.allSettled([
      context === null
        ? Promise.resolve(null)
        : Promise.all([
            context.dependencies.withdrawals.countByStatus(),
            context.dependencies.claims.countByStatus(),
          ]),
      getOpenSupportCount(),
      getVerificationQueue(identity().dependencies, { pendingLimit: 1, decidedLimit: 1 }),
      getRiskConsole(),
    ]);

    if (ledgerCounts.status === 'rejected') {
      logger.warn({ event: 'console_queue_count_failed', module: 'ledger' }, ledgerCounts.reason);
    }

    const pending = (rows: readonly { status: string; total: number }[]) =>
      rows.find((row) => row.status === 'pending')?.total ?? 0;

    const rows = ledgerCounts.status === 'fulfilled' ? ledgerCounts.value : null;

    return {
      // One badge for one queue: the approvals screen decides both withdrawals and
      // deposits, so an operator reading "4" should find four things to act on.
      approvals: rows === null ? 0 : pending(rows[0]) + pending(rows[1]),
      tickets: tickets.status === 'fulfilled' ? tickets.value : 0,
      // The tally, not the page — `pendingLimit: 1` because the badge needs the
      // count and not the fifty rows behind it.
      kyc: kyc.status === 'fulfilled' ? kyc.value.counts.pending : 0,
      surveillance: risk.status === 'fulfilled' ? risk.value.open.length : 0,
    };
  },
);

/**
 * The whole overview, in one pass.
 *
 * Deduplicated per request so the banner, the tiles and the service panel — which
 * all read the same facts — cost one set of queries between them rather than three.
 */
export const getConsoleOverview = cache(async (): Promise<ConsoleOverviewDto> => {
  const ledgerContext = ledger();
  const activityContext = activity();

  // `allSettled`, not `all`. The realistic failure is an unreachable database, in
  // which case every one of these rejects — and `Promise.all` leaves the rest
  // unattached, which Node terminates the process for by default. It also degrades
  // per panel: losing the price feed costs one row of the service list, not the page.
  const [operations, platformActivity, customers, live, markets] = await Promise.allSettled([
    ledgerContext === null
      ? Promise.resolve(null)
      : getOperationsSummary(ledgerContext.dependencies),
    activityContext === null
      ? Promise.resolve(null)
      : getPlatformActivity(activityContext.dependencies.events, new Date(), {
          days: ACTIVITY_DAYS,
        }),
    // Called through a function, not inline. `identity()` reaches `requireDb()`,
    // which *throws synchronously* when no database is configured — and a throw
    // while the array is still being built happens before `allSettled` exists to
    // catch it, taking down the page this whole function exists to keep standing.
    // Inside an async call the same throw becomes a rejection, which settles.
    readCustomers(),
    getLiveActivity({ limit: 1 }),
    getMarkets(),
  ]);

  const operationsValue = settled(operations) ?? UNAVAILABLE_OPERATIONS;
  const activityValue = settled(platformActivity) ?? UNAVAILABLE_ACTIVITY;
  const customersValue = settled(customers);
  const liveValue = settled(live);
  const marketsValue = settled(markets);

  if (customers.status === 'rejected') {
    logger.error({ event: 'console_customer_count_failed', module: 'identity' }, customers.reason);
  }

  return {
    operations: operationsValue,
    activity: activityValue,
    customers: {
      total: customersValue?.total ?? 0,
      byStatus: customersValue?.tallies ?? [],
      degraded: customersValue === null,
    },
    live: {
      active: liveValue?.totals.active ?? 0,
      idle: liveValue?.totals.idle ?? 0,
      signedIn: liveValue?.totals.signedIn ?? 0,
      degraded: liveValue?.degraded ?? true,
    },
    services: checkServices({
      ledgerConfigured: ledgerContext !== null,
      operations: operationsValue,
      activityConfigured: activityContext !== null,
      activity: activityValue,
      customersOk: customersValue !== null,
      liveDegraded: liveValue?.degraded ?? true,
      markets: marketsValue,
    }),
    decisionActors: await describeOperators(operationsValue.recentDecisions),
  };
});

async function readCustomers() {
  return identity().listUsers({ limit: 1 });
}

function settled<T>(result: PromiseSettledResult<T | null>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

const UNAVAILABLE_OPERATIONS: OperationsSummaryDto = {
  pending: { withdrawals: 0, deposits: 0, unpriced: 0 },
  heldValueUsd: null,
  decisionsByDay: [],
  recentDecisions: [],
  degraded: true,
};

const UNAVAILABLE_ACTIVITY: PlatformActivityDto = { days: [], total: 0, degraded: true };

/**
 * The status board, derived from reads this page already made.
 *
 * No synthetic probe: a `SELECT 1` that succeeds while the query a page actually
 * runs is timing out reports green on a broken screen. These rows say whether the
 * thing an operator depends on answered *this request*, which is the only claim
 * available without a monitoring system behind it.
 *
 * The consequence is honest and worth stating: this is a liveness check at the
 * moment of the page load, not availability over a window. It cannot tell you a
 * service was down an hour ago.
 */
function checkServices(input: {
  ledgerConfigured: boolean;
  operations: OperationsSummaryDto;
  activityConfigured: boolean;
  activity: PlatformActivityDto;
  customersOk: boolean;
  liveDegraded: boolean;
  markets: Awaited<ReturnType<typeof getMarkets>> | null;
}): ServiceCheckDto[] {
  const priced = input.markets ?? [];
  const liveQuotes = priced.filter((market) => market.quote.state === 'live').length;
  const staleQuotes = priced.filter((market) => market.quote.state === 'stale').length;

  return [
    {
      name: 'Ledger',
      state: !input.ledgerConfigured
        ? 'unavailable'
        : input.operations.degraded
          ? 'degraded'
          : 'operational',
      detail: !input.ledgerConfigured
        ? 'No database configured'
        : input.operations.degraded
          ? 'Some reads failed on this request'
          : `${input.operations.pending.withdrawals + input.operations.pending.deposits} items awaiting a decision`,
    },
    {
      name: 'Accounts directory',
      state: input.customersOk ? 'operational' : 'unavailable',
      detail: input.customersOk ? 'Answered this request' : 'Did not answer',
    },
    {
      name: 'Price feed',
      state:
        input.markets === null || priced.length === 0
          ? 'unavailable'
          : liveQuotes === priced.length
            ? 'operational'
            : 'degraded',
      detail:
        input.markets === null || priced.length === 0
          ? 'No quotes available'
          : // A stale quote is a real state with real consequences: the ledger
            // refuses to value a withdrawal against one, so withdrawals stop.
            `${liveQuotes} of ${priced.length} quotes live${staleQuotes > 0 ? `, ${staleQuotes} stale` : ''}`,
    },
    {
      name: 'Presence',
      state: input.liveDegraded ? 'degraded' : 'operational',
      detail: input.liveDegraded ? 'Live board could not be read' : 'Heartbeats arriving',
    },
    {
      name: 'Activity trail',
      state: !input.activityConfigured
        ? 'unavailable'
        : input.activity.degraded
          ? 'degraded'
          : 'operational',
      detail: !input.activityConfigured
        ? 'No database configured'
        : input.activity.degraded
          ? 'Could not be read'
          : `${input.activity.total} events in ${ACTIVITY_DAYS} days`,
    },
  ];
}

/**
 * Operator ids resolved to addresses.
 *
 * Never fails the page. A decision whose operator cannot be looked up still has to
 * render — the id is on the row either way, and an operator reading an audit list
 * needs to see that a decision happened even when the directory is the thing that
 * is down.
 */
async function describeOperators(
  decisions: readonly DecisionDto[],
): Promise<Record<string, string>> {
  const ids = [...new Set(decisions.map((decision) => decision.operatorId))].flatMap((id) => {
    if (id === null) return [];
    try {
      return [toUserId(id)];
    } catch {
      return [];
    }
  }) as UserId[];

  if (ids.length === 0) return {};

  try {
    const found = await identity().describeUsers(ids);
    return Object.fromEntries([...found.values()].map((user) => [user.id, user.email]));
  } catch (error) {
    logger.warn({ event: 'console_operator_lookup_failed', module: 'identity' }, error);
    return {};
  }
}
