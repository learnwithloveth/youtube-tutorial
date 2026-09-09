'use client';

import Link from 'next/link';
import { ArrowUpRight, BadgeCheck, FileClock, Gift, Headset, ShieldAlert } from 'lucide-react';
import { AdminPageHeader } from '../_components/admin-ui';
import { Panel, PanelHeader } from '../../_console/components/page-header';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { AreaChart } from '@/shared/ui/charts/area-chart';
import { BarChart } from '@/shared/ui/charts/bar-chart';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin, useQueues } from '../_data/store';
import { APPROVAL_THROUGHPUT, PLATFORM_VOLUME, SERVICE_HEALTH } from '../_data/data';
import { axisMoney, dayLabel, fullDayLabel, money, moneyExact } from '../../_console/data/format';
import { formatCompact } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

const QUEUE_CARDS = [
  { key: 'approvals', label: 'Approvals waiting', href: '/admin/approvals', icon: BadgeCheck, blurb: 'Deposits and withdrawals held for a decision' },
  { key: 'kyc', label: 'KYC cases', href: '/admin/kyc', icon: FileClock, blurb: 'Identity submissions awaiting adjudication' },
  { key: 'tickets', label: 'Open conversations', href: '/admin/support', icon: Headset, blurb: 'Customers waiting on a reply' },
  { key: 'surveillance', label: 'Surveillance alerts', href: '/admin/surveillance', icon: ShieldAlert, blurb: 'Patterns flagged for market-abuse review' },
  { key: 'payouts', label: 'Payouts to release', href: '/admin/payouts', icon: Gift, blurb: 'Referral earnings pending approval' },
] as const;

export default function CommandCentrePage() {

  const { state } = useAdmin();
  const queues = useQueues();

  const pendingValue = state.approvals
    .filter((a) => a.state === 'pending' || a.state === 'escalated')
    .reduce((s, a) => s + a.value, 0);

  const degraded = SERVICE_HEALTH.filter((s) => s.status !== 'operational');

  return (
    <>
      <AdminPageHeader
        title="Command centre"
        description="Everything waiting on a human, and the platform numbers behind it."
      />

      {degraded.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn/35 bg-warn/8 px-4 py-3">
          <ShieldAlert className="size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm text-fg">
            {degraded.length} service{degraded.length === 1 ? '' : 's'} not fully operational —{' '}
            <span className="text-fg-muted">{degraded.map((d) => d.name).join(', ')}</span>
          </p>
          <Link href="/admin/system" className="text-xs font-medium text-warn hover:underline">
            Open system health
          </Link>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="24h platform volume" value={formatCompact(41_200_000_000, 'USD')} delta={{ value: '+8.4%', direction: 'up', period: 'vs yesterday' }} />
        <StatTile label="Value held for approval" value={money(pendingValue)} delta={{ value: `${queues.approvals} items`, direction: 'flat', period: 'in the queue' }} upIsGood={false} />
        <StatTile label="Verified traders" value={formatCompact(41_206_884)} delta={{ value: '+18,402', direction: 'up', period: 'this week' }} />
        <StatTile label="Median first reply" value="88s" delta={{ value: '−12s', direction: 'down', period: 'vs last week' }} upIsGood={false} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {QUEUE_CARDS.map((card) => {
          const count = queues[card.key];
          return (
            <Link
              key={card.key}
              href={card.href}
              className={cn(
                'group rounded-lg border p-4 transition-colors',
                count > 0
                  ? 'border-warn/35 bg-warn/8 hover:border-warn/60'
                  : 'border-line bg-bg-elev/70 hover:border-line-strong',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <card.icon className={cn('size-4', count > 0 ? 'text-warn' : 'text-fg-subtle')} />
                <ArrowUpRight className="size-3.5 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <p className={cn('mt-3 font-sans text-2xl font-semibold tabular-nums', count > 0 ? 'text-fg' : 'text-fg-muted')}>
                {count}
              </p>
              <p className="mt-0.5 text-xs font-medium text-fg">{card.label}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">{card.blurb}</p>
            </Link>
          );
        })}
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title="Platform volume"
          subtitle="Notional traded across all markets, last 30 days"
          table={{
            columns: ['Date', 'Volume'],
            numericFrom: 1,
            rows: PLATFORM_VOLUME.map((p) => [fullDayLabel(p.t), moneyExact(p.v)]),
          }}
        >
          <AreaChart
            data={PLATFORM_VOLUME}
            height={240}
            label="Platform volume"
            formatValue={axisMoney}
            formatX={dayLabel}
            ariaSummary="Platform trading volume over the last 30 days."
          />
        </ChartFrame>

        <ChartFrame
          title="Approvals cleared"
          subtitle="Decisions per day this week"
          table={{
            columns: ['Day', 'Cleared'],
            numericFrom: 1,
            rows: APPROVAL_THROUGHPUT.map((d) => [d.label, d.value]),
          }}
        >
          <BarChart
            bars={APPROVAL_THROUGHPUT}
            height={240}
            formatValue={(v) => String(Math.round(v))}
            ariaSummary="Approval decisions cleared per day this week."
          />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Panel>
          <PanelHeader
            title="Service health"
            actions={<Link href="/admin/system" className="text-xs font-medium text-brand-soft hover:underline">Details</Link>}
          />
          <ul className="divide-y divide-line/60">
            {SERVICE_HEALTH.map((service) => (
              <li key={service.name} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    service.status === 'operational' ? 'bg-up' : service.status === 'degraded' ? 'bg-warn' : 'bg-accent',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{service.name}</span>
                <span className="text-2xs tabular-nums text-fg-subtle">{service.uptime.toFixed(3)}%</span>
                <Badge tone={service.status === 'operational' ? 'up' : service.status === 'degraded' ? 'warn' : 'accent'}>
                  {service.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader
            title="Recent privileged actions"
            subtitle="Written by the same transition that changed the record"
            actions={<Link href="/admin/audit" className="text-xs font-medium text-brand-soft hover:underline">Full log</Link>}
          />
          <ul className="divide-y divide-line/60">
            {state.audit.slice(0, 7).map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    entry.severity === 'critical' ? 'bg-down' : entry.severity === 'notice' ? 'bg-warn' : 'bg-fg-subtle',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    <span className="font-mono text-xs text-brand-soft">{entry.action}</span>{' '}
                    <span className="text-fg-subtle">on</span> {entry.target}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">
                    {entry.actor} · {entry.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
