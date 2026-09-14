import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  IdCard,
  Receipt,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';

import type { DecisionDto } from '@/modules/ledger';
import {
  getConsoleOverview,
  getPendingQueueCounts,
  type ServiceCheckDto,
} from '@/server/console';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';

import { AdminPageHeader } from '../_components/admin-ui';
import { ActivityChart, DecisionsChart } from './_components/overview-charts';
import { Panel, PanelHeader } from '../../_console/components/page-header';
import { dayLabel, fullDayLabel } from '../../_console/data/format';
import { usd } from '../../(platform)/app/_lib/format-usd';

/**
 * The command centre.
 *
 * ── Every number here is counted, and several are missing because of it ────────
 * This screen used to open with a 24-hour trading volume of $41.2B, 41.2 million
 * verified traders and a median first reply of 88 seconds. All three came from a
 * seeded random-number generator, and none of them could ever have been true —
 * there is no matching engine, no support desk and nothing measuring reply times.
 * The service board carried uptime to three decimal places for six services, which
 * was the most convincing thing on the page and the least real.
 *
 * They are gone rather than reimplemented, which is the rule the approvals queue
 * already applies to its risk scores: a figure on an operations console is read as
 * a measurement, and a plausible constant is worse than a blank, because a blank
 * cannot be acted on by mistake.
 *
 * What is here instead is what the platform can actually count.
 *
 * ── No deltas, for the same reason ─────────────────────────────────────────────
 * Every tile's second line states a *composition* — how the number breaks down —
 * never a change against last week. Nothing snapshots these figures over time, so
 * "+8.4% vs yesterday" would have to be invented, and an arrow next to a number is
 * read as measured history.
 *
 * ── A Server Component ────────────────────────────────────────────────────────
 * It reads and renders once; only the charts are interactive, and those are client
 * leaves. The previous version was `'use client'` because it reduced over an
 * in-memory fixture store.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Command centre',
  robots: { index: false, follow: false },
};

export default async function CommandCentrePage() {
  // Both deduplicated per request by `cache`, so the layout's rail badge and
  // these cards cost one set of reads between them and cannot disagree.
  const [overview, queues] = await Promise.all([
    getConsoleOverview(),
    getPendingQueueCounts(),
  ]);
  const { operations, activity, customers, live, services, decisionActors } = overview;

  const waiting = operations.pending.withdrawals + operations.pending.deposits;
  const unhealthy = services.filter((service) => service.state !== 'operational');

  const active = customers.byStatus.find((row) => row.status === 'active')?.total ?? 0;

  return (
    <>
      <AdminPageHeader
        title="Command centre"
        description="Everything waiting on a human, and the platform numbers behind it."
      />

      {unhealthy.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn/35 bg-warn/8 px-4 py-3">
          <ShieldAlert className="size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm text-fg">
            {unhealthy.length} dependenc{unhealthy.length === 1 ? 'y is' : 'ies are'} not
            answering normally —{' '}
            <span className="text-fg-muted">
              {unhealthy.map((service) => service.name).join(', ')}
            </span>
          </p>
          <Link href="/admin/system" className="text-xs font-medium text-warn hover:underline">
            Open system health
          </Link>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Value held for approval"
          // Null is a state, not a gap. A dash says the platform could not value
          // every held request; a zero would say it is holding nothing.
          value={operations.heldValueUsd === null ? '—' : usd(operations.heldValueUsd)}
          delta={{
            value:
              operations.heldValueUsd === null
                ? 'Not all requests could be priced'
                : `${operations.pending.withdrawals} withdrawal${operations.pending.withdrawals === 1 ? '' : 's'}`,
            direction: 'flat',
            period: operations.heldValueUsd === null ? '' : 'reserved on customer accounts',
          }}
        />
        <StatTile
          label="Awaiting a decision"
          value={String(waiting)}
          delta={{
            value:
              operations.pending.needingSecondSignature > 0
                ? `${operations.pending.needingSecondSignature} need a second signature`
                : 'None need a second signature',
            direction: 'flat',
            period: '',
          }}
        />
        <StatTile
          label="Customers"
          value={customers.degraded ? '—' : customers.total.toLocaleString('en-US')}
          delta={{
            value: customers.degraded ? 'Directory unavailable' : `${active} active`,
            direction: 'flat',
            period: customers.degraded ? '' : 'of all registered accounts',
          }}
        />
        <StatTile
          label="On the site now"
          value={live.degraded ? '—' : String(live.active)}
          delta={{
            value: live.degraded ? 'Live board unavailable' : `${live.signedIn} signed in`,
            direction: 'flat',
            period: live.degraded ? '' : `· ${live.idle} idle`,
          }}
        />
      </div>

      {/* Four queues, because four are what exist. Referral payouts, listings and
          incidents still have no module behind them and so have no card: a count
          that nobody can clear is an operator's time spent looking for work that is
          not there. KYC and surveillance earned theirs back — both now read the
          database rather than a fixture. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <QueueCard
          href="/admin/approvals"
          icon={ArrowUpFromLine}
          count={operations.pending.withdrawals}
          label="Withdrawals held"
          blurb="Funds reserved on a customer's account until someone decides"
        />
        <QueueCard
          href="/admin/approvals"
          icon={ArrowDownToLine}
          count={operations.pending.deposits}
          label="Deposits to confirm"
          blurb="Customers have filed evidence that funds arrived"
        />
        <QueueCard
          href="/admin/kyc"
          icon={IdCard}
          count={queues.kyc}
          label="Identity documents"
          blurb="Customers waiting on a verification decision"
        />
        <QueueCard
          href="/admin/surveillance"
          icon={ShieldAlert}
          count={queues.surveillance}
          label="Risk findings"
          blurb="Rules matched movements nobody has reviewed yet"
        />
        <Link
          href="/admin/transactions"
          className="group rounded-lg border border-line bg-bg-elev/70 p-4 transition-colors hover:border-line-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <Receipt className="size-4 text-fg-subtle" />
            <ArrowUpRight className="size-3.5 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
          <p className="mt-3 font-sans text-2xl font-semibold tabular-nums text-fg-muted">
            {activity.degraded ? '—' : activity.total.toLocaleString('en-US')}
          </p>
          <p className="mt-0.5 text-xs font-medium text-fg">Recorded events, 30 days</p>
          <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">
            Page views and sign-ins across the platform
          </p>
        </Link>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title="Platform activity"
          subtitle="Recorded events per day, last 30 days"
          table={{
            columns: ['Date', 'Events'],
            numericFrom: 1,
            rows: activity.days.map((day) => [fullDayLabel(dayStart(day.day)), day.total]),
          }}
        >
          {activity.days.length > 0 ? (
            // The chart and its axis formatters live behind a client boundary — a
            // function cannot be serialised into the RSC payload, and this page is
            // a Server Component. See `overview-charts.tsx`.
            <ActivityChart
              data={activity.days.map((day) => ({ t: dayStart(day.day), v: day.total }))}
            />
          ) : (
            <ChartUnavailable reason="The activity trail could not be read." />
          )}
        </ChartFrame>

        <ChartFrame
          title="Decisions cleared"
          subtitle="Deposits and withdrawals decided, last 7 days"
          table={{
            columns: ['Day', 'Approved', 'Rejected'],
            numericFrom: 1,
            rows: operations.decisionsByDay.map((day) => [
              fullDayLabel(dayStart(day.day)),
              day.approved,
              day.rejected,
            ]),
          }}
        >
          {operations.decisionsByDay.length > 0 ? (
            // One bar per day, approvals and rejections summed. The split is in the
            // table above, which `ChartFrame` always renders — a value a reader can
            // only reach by hovering is a value some readers cannot reach.
            <DecisionsChart
              bars={operations.decisionsByDay.map((day) => ({
                label: dayLabel(dayStart(day.day)),
                value: day.approved + day.rejected,
              }))}
            />
          ) : (
            <ChartUnavailable reason="The ledger could not be read." />
          )}
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Panel>
          <PanelHeader
            title="Dependencies"
            subtitle="Whether each one answered this request"
            actions={
              <Link
                href="/admin/system"
                className="text-xs font-medium text-brand-soft hover:underline"
              >
                Details
              </Link>
            }
          />
          <ul className="divide-y divide-line/60">
            {services.map((service) => (
              <ServiceRow key={service.name} service={service} />
            ))}
          </ul>
          {/* Said once, here, rather than implied by a number that looks like
              monitoring. Nothing in this application records availability over
              time, so this panel cannot tell you a service was down an hour ago. */}
          <p className="mt-4 text-2xs leading-relaxed text-fg-subtle">
            A liveness check at the moment this page loaded, not availability over a
            window. Nothing here measures uptime.
          </p>
        </Panel>

        <Panel>
          <PanelHeader
            title="Recent privileged actions"
            subtitle="Written by the same transition that changed the record"
            actions={
              <Link
                href="/admin/transactions"
                className="text-xs font-medium text-brand-soft hover:underline"
              >
                Full feed
              </Link>
            }
          />
          {operations.recentDecisions.length === 0 ? (
            <p className="py-6 text-center text-xs text-fg-subtle">
              {operations.degraded
                ? 'The ledger could not be read.'
                : 'No decisions recorded yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {operations.recentDecisions.map((decision) => (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  operator={
                    decision.operatorId === null
                      ? null
                      : (decisionActors[decision.operatorId] ?? decision.operatorId)
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

/**
 * `YYYY-MM-DD` back to a timestamp.
 *
 * Parsed as UTC midnight — the buckets were cut in UTC, and letting `new Date()`
 * apply the viewer's zone would shift every label by a day for anyone west of
 * Greenwich, on a page whose formatters deliberately render in UTC.
 */
function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function ChartUnavailable({ reason }: { reason: string }) {
  return (
    <div className="flex h-60 flex-col items-center justify-center gap-2 text-xs text-fg-subtle">
      <TriangleAlert className="size-4 text-warn" />
      {/* An empty frame, not a flat line. A line of zeros would assert that
          nothing happened, which a failed read is in no position to claim. */}
      <p>{reason}</p>
    </div>
  );
}

function QueueCard({
  href,
  icon: Icon,
  count,
  label,
  blurb,
}: {
  href: string;
  icon: typeof ArrowUpFromLine;
  count: number;
  label: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group rounded-lg border p-4 transition-colors',
        count > 0
          ? 'border-warn/35 bg-warn/8 hover:border-warn/60'
          : 'border-line bg-bg-elev/70 hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className={cn('size-4', count > 0 ? 'text-warn' : 'text-fg-subtle')} />
        <ArrowUpRight className="size-3.5 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <p
        className={cn(
          'mt-3 font-sans text-2xl font-semibold tabular-nums',
          count > 0 ? 'text-fg' : 'text-fg-muted',
        )}
      >
        {count}
      </p>
      <p className="mt-0.5 text-xs font-medium text-fg">{label}</p>
      <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">{blurb}</p>
    </Link>
  );
}

function ServiceRow({ service }: { service: ServiceCheckDto }) {
  const tone =
    service.state === 'operational' ? 'up' : service.state === 'degraded' ? 'warn' : 'down';

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          service.state === 'operational'
            ? 'bg-up'
            : service.state === 'degraded'
              ? 'bg-warn'
              : 'bg-down',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{service.name}</span>
        <span className="block truncate text-2xs text-fg-subtle">{service.detail}</span>
      </span>
      <Badge tone={tone}>{service.state}</Badge>
    </li>
  );
}

function DecisionRow({
  decision,
  operator,
}: {
  decision: DecisionDto;
  operator: string | null;
}) {
  const rejected = decision.action.endsWith('rejected');

  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          rejected ? 'bg-down' : 'bg-up',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          <span className="font-mono text-xs text-brand-soft">{decision.action}</span>{' '}
          <span className="text-fg-subtle">for</span>{' '}
          <span data-numeric>
            {decision.amount} {decision.asset}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-fg-subtle">
          {/* The operator, not a friendly name we do not have. `decidedBy` is a
              `UserId`; it resolves to an address when the directory answers, and
              stays an id when it does not — which is still actionable. */}
          {operator ?? 'System'} · {formatDate(decision.decidedAt)}
          {decision.reason !== null ? ` · ${decision.reason}` : ''}
        </p>
      </div>
    </li>
  );
}
