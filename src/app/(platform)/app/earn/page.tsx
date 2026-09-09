'use client';

import { useMemo, useState } from 'react';
import { Coins, ShieldCheck, Timer } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { AreaChart } from '@/shared/ui/charts/area-chart';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { ASSETS } from '../../../_console/data/assets';
import { REWARDS_SERIES, STAKE_POSITIONS, STAKING_ANNUAL, STAKING_VALUE } from '../../_data/data';
import { axisMoney, dayLabel, fullDayLabel, money, moneyExact } from '../../../_console/data/format';
import { formatQuantity } from '@/shared/lib/format';

const HORIZONS = [
  { value: '1y', label: '1 year' },
  { value: '3y', label: '3 years' },
  { value: '5y', label: '5 years' },
] as const;

export default function EarnPage() {

  const [horizon, setHorizon] = useState<'1y' | '3y' | '5y'>('1y');
  const years = horizon === '1y' ? 1 : horizon === '3y' ? 3 : 5;

  const earnedToDate = STAKE_POSITIONS.reduce((s, p) => s + p.earnedToDate, 0);
  const blendedApy = STAKING_VALUE === 0 ? 0 : (STAKING_ANNUAL / STAKING_VALUE) * 100;

  const projection = useMemo(
    () => STAKE_POSITIONS.reduce((sum, p) => sum + p.value * (Math.pow(1 + p.apy / 100 / 365, 365 * years) - 1), 0),
    [years],
  );

  const stakeable = ASSETS.filter(
    (a) => (a.apy ?? 0) > 0 && !STAKE_POSITIONS.some((p) => p.symbol === a.symbol),
  ).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Earn"
        description="Native protocol staking. Principal is never lent out and never leaves custody you can verify."
        actions={<Button size="sm"><Coins className="size-3.5" />Stake assets</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Staked value" value={moneyExact(STAKING_VALUE)} delta={{ value: `${STAKE_POSITIONS.length} positions`, direction: 'flat', period: 'active' }} />
        <StatTile label="Blended APY" value={`${blendedApy.toFixed(2)}%`} delta={{ value: `${money(STAKING_ANNUAL)}`, direction: 'up', period: 'projected per year' }} />
        <StatTile label="Rewards to date" value={money(earnedToDate)} delta={{ value: '+$41.28', direction: 'up', period: 'paid in the last 24h' }} />
        <StatTile label="Next payout" value="In 6 hours" delta={{ value: 'Daily at 00:00 UTC', direction: 'flat', period: '' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title="Cumulative rewards"
          subtitle="Paid daily and compounded, last 90 days"
          table={{
            columns: ['Date', 'Cumulative rewards'],
            numericFrom: 1,
            rows: REWARDS_SERIES.map((p) => [fullDayLabel(p.t), moneyExact(p.v)]),
          }}
        >
          <AreaChart
            data={REWARDS_SERIES}
            color="var(--chart-2)"
            height={250}
            label="Cumulative rewards"
            formatValue={axisMoney}
            formatX={dayLabel}
            ariaSummary={`Cumulative staking rewards over 90 days, reaching ${money(earnedToDate)}.`}
          />
        </ChartFrame>

        <Panel>
          <PanelHeader
            title="Projection"
            subtitle="Current rates, daily compounding"
            actions={
              <SegmentedControl
                ariaLabel="Projection horizon"
                size="sm"
                segments={HORIZONS}
                value={horizon}
                onChange={setHorizon}
              />
            }
          />
          <p className="font-sans text-3xl font-semibold tracking-tight text-fg">{money(projection)}</p>
          <p className="mt-1.5 text-sm text-fg-muted">
            projected rewards over {years} {years === 1 ? 'year' : 'years'} on today&apos;s staked balance
          </p>

          <ul className="mt-6 space-y-3 border-t border-line pt-5">
            {[
              { icon: Timer, text: 'Rewards credited every 24 hours at 00:00 UTC, not at epoch end.' },
              { icon: ShieldCheck, text: 'Validator faults covered to $50M by the slashing shield.' },
              { icon: Coins, text: 'Flat 8% commission — the industry charges 25–35% of rewards.' },
            ].map((item) => (
              <li key={item.text} className="flex gap-2.5 text-xs leading-relaxed text-fg-muted">
                <item.icon className="mt-0.5 size-3.5 shrink-0 text-brand-soft" />
                {item.text}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-2xs leading-relaxed text-fg-subtle">
            Rates float with network conditions. A projection is an illustration, not a forecast,
            and staking pays in the same asset — a 9% yield on something that halves is still a loss.
          </p>
        </Panel>
      </div>

      <Panel className="mb-4">
        <PanelHeader title="Your positions" subtitle="Staked balances and accrued rewards" />
        <TableShell caption="Active staking positions" minWidth="48rem">
          <thead>
            <tr>
              <Th>Asset</Th><Th numeric>Staked</Th><Th numeric>Value</Th>
              <Th numeric>APY</Th><Th numeric>Earned</Th>
              <Th className="hidden md:table-cell">Unstaking</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {STAKE_POSITIONS.map((p) => (
              <Tr key={p.symbol}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <AssetMark symbol={p.symbol} glyph={p.glyph} hue={p.hue} size="sm" />
                    <span>
                      <span className="block text-sm font-medium text-fg">{p.name}</span>
                      <span className="block text-2xs text-fg-subtle">{p.symbol}</span>
                    </span>
                  </span>
                </Td>
                <Td numeric>{formatQuantity(p.staked, 2)}</Td>
                <Td numeric className="font-medium text-fg">{moneyExact(p.value)}</Td>
                <Td numeric><span className="text-up">{p.apy.toFixed(1)}%</span></Td>
                <Td numeric className="text-up">{moneyExact(p.earnedToDate)}</Td>
                <Td className="hidden md:table-cell">
                  <Badge tone={p.unbonding === 'Instant' ? 'up' : 'neutral'}>{p.unbonding}</Badge>
                </Td>
                <Td numeric>
                  <button type="button" className="rounded-sm border border-line px-2.5 py-1 text-2xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg">
                    Unstake
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>

      <Panel>
        <PanelHeader title="Available to stake" subtitle="Assets you hold or can buy that earn a yield" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stakeable.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-md border border-line bg-bg-sunken/50 p-4">
              <AssetMark symbol={a.symbol} glyph={a.glyph} hue={a.hue} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{a.name}</p>
                <p className="text-2xs text-fg-subtle">{a.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-up">{a.apy?.toFixed(1)}%</p>
                <p className="text-2xs uppercase tracking-wider text-fg-subtle">APY</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
