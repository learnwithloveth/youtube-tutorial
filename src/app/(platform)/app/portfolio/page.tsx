'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, Download } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { DonutChart } from '@/shared/ui/charts/donut-chart';
import { BarChart } from '@/shared/ui/charts/bar-chart';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';
import { usePortfolio, useAllocation } from '../../_data/use-account';
import { MONTHLY_PNL } from '../../_data/data';
import { axisMoney, money, moneyExact, signedMoney, signedPercent } from '../../../_console/data/format';
import { formatCompact, formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

type SortKey = 'value' | 'pnl' | 'weight' | 'symbol';

export default function PortfolioPage() {

  const { holdings, total, invested, pnl, pnlPercent } = usePortfolio();
  const allocation = useAllocation(5);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
  const [view, setView] = useState<'all' | 'staked'>('all');

  const rows = useMemo(() => {
    const base = view === 'staked' ? holdings.filter((h) => h.staked > 0) : holdings;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === 'symbol') return a.asset.symbol.localeCompare(b.asset.symbol) * factor;
      if (sort.key === 'pnl') return (a.pnl - b.pnl) * factor;
      if (sort.key === 'weight') return (a.weight - b.weight) * factor;
      return (a.value - b.value) * factor;
    });
  }, [holdings, sort, view]);

  const toggle = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const realised = MONTHLY_PNL.reduce((s, m) => s + m.value, 0);
  const bestMonth = MONTHLY_PNL.reduce((a, b) => (b.value > a.value ? b : a));

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Cost basis, unrealised position and realised results by month."
        actions={
          <Button variant="outline" size="sm">
            <Download className="size-3.5" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Market value" value={moneyExact(total)} delta={{ value: signedPercent(pnlPercent), direction: pnl >= 0 ? 'up' : 'down', period: 'unrealised' }} />
        <StatTile label="Total invested" value={money(invested)} delta={{ value: `${holdings.length} assets`, direction: 'flat', period: 'held' }} />
        <StatTile label="Unrealised P&L" value={signedMoney(pnl)} delta={{ value: signedPercent(pnlPercent), direction: pnl >= 0 ? 'up' : 'down', period: 'on cost basis' }} />
        <StatTile label="Realised, 12 months" value={signedMoney(realised)} delta={{ value: `Best ${bestMonth.month}`, direction: 'up', period: signedMoney(bestMonth.value) }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <ChartFrame
          title="Allocation"
          subtitle="By market value"
          table={{
            columns: ['Asset', 'Value', 'Share'],
            numericFrom: 1,
            rows: allocation.map((a) => [a.label, moneyExact(a.value), `${a.share.toFixed(1)}%`]),
          }}
        >
          <DonutChart slices={allocation} formatValue={money} centerLabel="Total" centerValue={formatCompact(total, 'USD')} />
        </ChartFrame>

        <ChartFrame
          title="Realised profit and loss"
          subtitle="Closed positions by month — the sign is carried by the baseline, the hue and the label"
          legend={[
            { label: 'Profit', color: 'var(--up)' },
            { label: 'Loss', color: 'var(--down)' },
          ]}
          table={{
            columns: ['Month', 'Realised'],
            numericFrom: 1,
            rows: MONTHLY_PNL.map((m) => [m.month, signedMoney(m.value)]),
          }}
        >
          <BarChart
            bars={MONTHLY_PNL.map((m) => ({ label: m.month, value: m.value }))}
            formatValue={axisMoney}
            ariaSummary={`Realised profit and loss by month over the past year, totalling ${signedMoney(realised)}.`}
          />
        </ChartFrame>
      </div>

      <Panel>
        <PanelHeader
          title="Holdings"
          subtitle="Every position, with cost basis and live mark"
          actions={
            <SegmentedControl
              ariaLabel="Filter holdings"
              size="sm"
              segments={[
                { value: 'all', label: 'All' },
                { value: 'staked', label: 'Staked' },
              ]}
              value={view}
              onChange={setView}
            />
          }
        />
        <TableShell caption="Holdings with quantity, cost basis, market value and profit or loss" minWidth="54rem">
          <thead>
            <tr>
              {([
                ['Asset', 'symbol', false],
                ['Quantity', null, true],
                ['Avg cost', null, true],
                ['Price', null, true],
                ['Value', 'value', true],
                ['P&L', 'pnl', true],
                ['Weight', 'weight', true],
              ] as const).map(([label, key, numeric]) => (
                <Th key={label} numeric={numeric}
                    aria-sort={key && sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {key ? (
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-fg',
                        sort.key === key && 'text-fg',
                      )}
                    >
                      {label}
                      <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    label
                  )}
                </Th>
              ))}
              <Th numeric className="hidden lg:table-cell">7d</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <Tr key={h.asset.id}>
                <Td>
                  <Link href={`/markets/${h.asset.id}`} className="flex items-center gap-3">
                    <AssetMark symbol={h.asset.symbol} glyph={h.asset.glyph} hue={h.asset.hue} size="sm" />
                    <span>
                      <span className="block text-sm font-medium text-fg">{h.asset.name}</span>
                      <span className="block text-2xs text-fg-subtle">
                        {h.asset.symbol}
                        {h.staked > 0 ? ` · ${formatQuantity(h.staked, 2)} staked` : ''}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td numeric>{formatQuantity(h.quantity, h.quantity < 1 ? 4 : 2)}</Td>
                <Td numeric>{moneyExact(h.costBasis)}</Td>
                <Td numeric>{moneyExact(h.price)}</Td>
                <Td numeric className="font-medium text-fg">{moneyExact(h.value)}</Td>
                <Td numeric>
                  <span className={h.pnl >= 0 ? 'text-up' : 'text-down'}>
                    {signedMoney(h.pnl)}
                    <span className="ml-1.5 text-2xs opacity-80">{signedPercent(h.pnlPercent)}</span>
                  </span>
                </Td>
                <Td numeric>{h.weight.toFixed(1)}%</Td>
                <Td numeric className="hidden lg:table-cell">
                  <div className="flex justify-end">
                    <Sparkline id={`portfolio-${h.asset.symbol}`} data={h.spark} positive={h.asset.change7d >= 0} width={70} height={22} filled={false} />
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
