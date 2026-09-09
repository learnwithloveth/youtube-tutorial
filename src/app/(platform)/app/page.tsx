'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Coins, Percent, Repeat, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../_console/components/table';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { AreaChart } from '@/shared/ui/charts/area-chart';
import { DonutChart } from '@/shared/ui/charts/donut-chart';
import { Heatmap } from '@/shared/ui/charts/heatmap';
import { HeroFigure, StatTile } from '@/shared/ui/charts/stat-tile';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';
import { usePortfolio, useAllocation } from '../_data/use-account';
import {
  ACTIVITY, AVAILABLE_CASH, PORTFOLIO_SERIES, RANGE_KEYS, STAKING_ANNUAL, STAKING_VALUE,
  TRANSACTIONS, type RangeKey,
} from '../_data/data';
import {
  axisMoney, dayLabel, dateTimeLabel, fullDayLabel, money, moneyExact, signedMoney, signedPercent,
} from '../../_console/data/format';
import { formatCompact, formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

const RANGE_LABEL: Record<RangeKey, string> = {
  '24h': 'past 24 hours', '7d': 'past 7 days', '30d': 'past 30 days',
  '90d': 'past 90 days', '1y': 'past year',
};

export default function OverviewPage() {

  const { holdings, total, pnl, pnlPercent, netWorth } = usePortfolio();
  const allocation = useAllocation(5);
  const [range, setRange] = useState<RangeKey>('30d');

  const series = PORTFOLIO_SERIES[range];
  const rangeChange = useMemo(() => {
    const first = series[0]?.v ?? 0;
    const last = series[series.length - 1]?.v ?? 0;
    return { abs: last - first, pct: first === 0 ? 0 : ((last - first) / first) * 100 };
  }, [series]);

  const recent = TRANSACTIONS.slice(0, 6);
  const best = holdings.reduce<(typeof holdings)[number] | undefined>(
    (leader, candidate) =>
      leader === undefined || candidate.pnlPercent > leader.pnlPercent ? candidate : leader,
    undefined,
  );

  return (
    <>
      <PageHeader
        title="Overview"
        description="Everything moving in your account, updated live."
        actions={
          <>
            <ButtonLink href="/app/trade" size="sm">
              <TrendingUp className="size-3.5" />
              Trade
            </ButtonLink>
            <ButtonLink href="/app/wallet" variant="outline" size="sm">
              Deposit
            </ButtonLink>
          </>
        }
      />

      {/* Hero + range-scoped chart. One filter row scopes everything it governs. */}
      <Panel className="mb-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <HeroFigure
            label="Portfolio value"
            value={moneyExact(total)}
            delta={
              <>
                <span className={cn('font-medium tabular-nums', pnl >= 0 ? 'text-up' : 'text-down')}>
                  {signedMoney(pnl)} ({signedPercent(pnlPercent)})
                </span>
                <span className="text-fg-subtle">all time</span>
                <span aria-hidden className="hidden h-3 w-px bg-line sm:block" />
                <span className={cn('tabular-nums', rangeChange.abs >= 0 ? 'text-up' : 'text-down')}>
                  {signedMoney(rangeChange.abs)}
                </span>
                <span className="text-fg-subtle">{RANGE_LABEL[range]}</span>
              </>
            }
          />
          <SegmentedControl
            ariaLabel="Chart range"
            size="sm"
            segments={RANGE_KEYS.map((key) => ({ value: key, label: key }))}
            value={range}
            onChange={setRange}
          />
        </div>

        <ChartFrame
          bare
          title="Value over time"
          subtitle={`Marked to live prices · ${RANGE_LABEL[range]}`}
          table={{
            columns: ['Date', 'Value'],
            numericFrom: 1,
            rows: series.map((p) => [fullDayLabel(p.t), moneyExact(p.v)]),
          }}
        >
          <AreaChart
            data={series}
            height={280}
            label="Portfolio value"
            formatValue={axisMoney}
            formatX={dayLabel}
            ariaSummary={`Portfolio value over the ${RANGE_LABEL[range]}, ending at ${moneyExact(total)}.`}
          />
        </ChartFrame>
      </Panel>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Available cash"
          value={money(AVAILABLE_CASH)}
          delta={{ value: '+$5,000', direction: 'up', period: 'deposited this week' }}
          icon={<Wallet className="size-4" />}
        />
        <StatTile
          label="Staked value"
          value={money(STAKING_VALUE)}
          delta={{ value: `${money(STAKING_ANNUAL)}/yr`, direction: 'up', period: 'projected rewards' }}
          icon={<Coins className="size-4" />}
        />
        <StatTile
          label="Net worth"
          value={money(netWorth)}
          delta={{ value: signedPercent(pnlPercent), direction: pnl >= 0 ? 'up' : 'down', period: 'since inception' }}
          icon={<TrendingUp className="size-4" />}
        />
        <StatTile
          label="30-day fees paid"
          value={money(412.88)}
          delta={{ value: '−18.2%', direction: 'down', period: 'vs last month' }}
          upIsGood={false}
          icon={<Percent className="size-4" />}
        />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel>
          <PanelHeader
            title="Holdings"
            subtitle={`${holdings.length} assets · marked live`}
            actions={
              <Link href="/app/portfolio" className="text-xs font-medium text-brand-soft hover:underline">
                View all
              </Link>
            }
          />
          <TableShell caption="Current holdings with live value and profit or loss">
            <thead>
              <tr>
                <Th>Asset</Th>
                <Th numeric>Price</Th>
                <Th numeric className="hidden sm:table-cell">Holdings</Th>
                <Th numeric>Value</Th>
                <Th numeric>P&L</Th>
                <Th numeric className="hidden md:table-cell">7d</Th>
              </tr>
            </thead>
            <tbody>
              {holdings.slice(0, 6).map((h) => (
                <Tr key={h.asset.id}>
                  <Td>
                    <Link href={`/markets/${h.asset.id}`} className="flex items-center gap-2.5">
                      <AssetMark symbol={h.asset.symbol} glyph={h.asset.glyph} hue={h.asset.hue} size="sm" />
                      <span>
                        <span className="block text-sm font-medium text-fg">{h.asset.symbol}</span>
                        <span className="block text-2xs text-fg-subtle">{h.weight.toFixed(1)}% of book</span>
                      </span>
                    </Link>
                  </Td>
                  <Td numeric>{moneyExact(h.price)}</Td>
                  <Td numeric className="hidden sm:table-cell">
                    {formatQuantity(h.quantity, h.quantity < 1 ? 4 : 2)}
                  </Td>
                  <Td numeric className="font-medium text-fg">{moneyExact(h.value)}</Td>
                  <Td numeric>
                    <span className={h.pnl >= 0 ? 'text-up' : 'text-down'}>{signedPercent(h.pnlPercent)}</span>
                  </Td>
                  <Td numeric className="hidden md:table-cell">
                    <div className="flex justify-end">
                      <Sparkline id={`overview-${h.asset.symbol}`} data={h.spark} positive={h.asset.change7d >= 0} width={64} height={22} filled={false} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>

        <ChartFrame
          title="Allocation"
          subtitle="Tail folded into Other — part-to-whole stays readable at six slices"
          table={{
            columns: ['Asset', 'Value', 'Share'],
            numericFrom: 1,
            rows: allocation.map((a) => [a.label, moneyExact(a.value), `${a.share.toFixed(1)}%`]),
          }}
        >
          <DonutChart
            slices={allocation}
            formatValue={money}
            centerLabel="Total"
            centerValue={formatCompact(total, 'USD')}
          />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <ChartFrame
          title="Trading activity"
          subtitle="Trades per day, last 18 weeks"
          table={{
            columns: ['Date', 'Trades'],
            numericFrom: 1,
            rows: ACTIVITY.filter((d) => d.count > 0).map((d) => [fullDayLabel(d.t), d.count]),
          }}
        >
          <div className="overflow-x-auto">
            <Heatmap data={ACTIVITY} formatDate={fullDayLabel} />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
            {[
              { k: 'Trades, 90d', v: String(ACTIVITY.reduce((s, d) => s + d.count, 0)) },
              { k: 'Best performer', v: `${best?.asset.symbol ?? '—'} ${signedPercent(best?.pnlPercent ?? 0)}` },
              { k: 'Longest streak', v: '11 days' },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-2xs uppercase tracking-wider text-fg-subtle">{s.k}</dt>
                <dd className="mt-1 text-sm font-medium tabular-nums text-fg">{s.v}</dd>
              </div>
            ))}
          </dl>
        </ChartFrame>

        <Panel>
          <PanelHeader
            title="Recent activity"
            actions={
              <Link href="/app/transactions" className="text-xs font-medium text-brand-soft hover:underline">
                All transactions
              </Link>
            }
          />
          <ul className="divide-y divide-line/60">
            {recent.map((tx) => (
              <li key={tx.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full border border-line',
                    tx.kind === 'buy' || tx.kind === 'deposit' || tx.kind === 'reward'
                      ? 'text-up'
                      : tx.kind === 'sell' || tx.kind === 'withdrawal'
                        ? 'text-down'
                        : 'text-fg-muted',
                  )}
                >
                  {tx.kind === 'reward' ? <Coins className="size-3.5" /> : tx.kind === 'stake' || tx.kind === 'unstake' ? <Repeat className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">
                    <span className="capitalize">{tx.kind}</span> {tx.symbol}
                  </p>
                  <p className="text-2xs text-fg-subtle">{dateTimeLabel(tx.timestamp)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums text-fg">{money(tx.value)}</p>
                  <Badge tone={tx.status === 'completed' ? 'up' : tx.status === 'pending' ? 'warn' : 'down'} className="mt-0.5">
                    {tx.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="mt-6 text-xs text-fg-subtle">
        Figures shown are illustrative demonstration data for a fictional exchange, not a real
        account. Prices move on a seeded simulation, not a live market feed.
      </p>
    </>
  );
}
