'use client';

import { useState } from 'react';
import { Pause, Play, Plus, Repeat } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { AreaChart } from '@/shared/ui/charts/area-chart';
import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { SelectField, TextField } from '@/shared/ui/primitives/field';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { ASSET_BY_ID } from '../../../_console/data/assets';
import { RECURRING_PLANS, buildSeries } from '../../_data/data';
import { axisMoney, dayLabel, fullDayLabel, money, moneyExact, signedPercent } from '../../../_console/data/format';

const INVESTED = RECURRING_PLANS.reduce((s, p) => s + p.invested, 0);

/** Value of everything bought through the plans, tracked against what went in. */
const DCA_SERIES = buildSeries('dca', 180, INVESTED * 1.34, 0.41);

export default function RecurringPage() {

  const [plans, setPlans] = useState(RECURRING_PLANS.map((p) => ({ ...p })));
  const active = plans.filter((p) => p.active).length;
  const monthly = plans
    .filter((p) => p.active)
    .reduce((s, p) => s + p.amount * (p.cadence === 'Weekly' ? 4.33 : p.cadence === 'Daily' ? 30 : p.cadence === 'Every 2 weeks' ? 2.17 : 1), 0);

  const currentValue = DCA_SERIES[DCA_SERIES.length - 1]?.v ?? INVESTED;
  const gain = currentValue - INVESTED;

  const toggle = (id: string) =>
    setPlans((current) => current.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));

  return (
    <>
      <PageHeader
        title="Recurring buys"
        description="Set a schedule once. Pausing pauses — it does not quietly cancel."
        actions={<Button size="sm"><Plus className="size-3.5" />New plan</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active plans" value={String(active)} delta={{ value: `${plans.length - active} paused`, direction: 'flat', period: '' }} icon={<Repeat className="size-4" />} />
        <StatTile label="Committed monthly" value={money(monthly)} delta={{ value: 'Across all plans', direction: 'flat', period: '' }} />
        <StatTile label="Total invested" value={money(INVESTED)} delta={{ value: 'Since first plan', direction: 'flat', period: '' }} />
        <StatTile label="Current value" value={money(currentValue)} delta={{ value: signedPercent((gain / INVESTED) * 100), direction: gain >= 0 ? 'up' : 'down', period: 'on contributions' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title="Value of recurring contributions"
          subtitle="What the automated buys are worth today, last 180 days"
          table={{
            columns: ['Date', 'Value'],
            numericFrom: 1,
            rows: DCA_SERIES.filter((_, i) => i % 5 === 0).map((p) => [fullDayLabel(p.t), moneyExact(p.v)]),
          }}
        >
          <AreaChart
            data={DCA_SERIES}
            color="var(--chart-1)"
            height={250}
            label="Contribution value"
            formatValue={axisMoney}
            formatX={dayLabel}
            ariaSummary={`Value of recurring contributions over 180 days, currently ${money(currentValue)} against ${money(INVESTED)} invested.`}
          />
        </ChartFrame>

        <Panel>
          <PanelHeader title="Create a plan" subtitle="Takes about twenty seconds" />
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <SelectField
              label="Asset"
              options={[
                { value: 'btc', label: 'Bitcoin (BTC)' },
                { value: 'eth', label: 'Ethereum (ETH)' },
                { value: 'sol', label: 'Solana (SOL)' },
                { value: 'link', label: 'Chainlink (LINK)' },
              ]}
            />
            <TextField label="Amount per execution" defaultValue="250" adornment={<span className="text-xs">USD</span>} />
            <SelectField
              label="Cadence"
              options={[
                { value: 'weekly', label: 'Every week' },
                { value: 'biweekly', label: 'Every two weeks' },
                { value: 'monthly', label: 'Every month' },
                { value: 'payday', label: 'On payday' },
              ]}
            />
            <SelectField
              label="Funding source"
              options={[
                { value: 'cash', label: 'Novex cash balance' },
                { value: 'bank', label: 'Bank · SEPA Instant ••4402' },
                { value: 'card', label: 'Card ••8821' },
              ]}
            />
            <Button type="submit" size="lg" className="w-full">Create plan</Button>
            <p className="text-center text-2xs text-fg-subtle">
              Recurring orders above $250 carry no commission.
            </p>
          </form>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Your plans" subtitle="Skip or resize a single instalment without touching the schedule" />
        <TableShell caption="Recurring buy plans" minWidth="50rem">
          <thead>
            <tr>
              <Th>Asset</Th><Th numeric>Amount</Th><Th>Cadence</Th>
              <Th>Next run</Th><Th numeric>Invested</Th><Th numeric>Avg cost</Th>
              <Th>Status</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const asset = ASSET_BY_ID.get(plan.symbol.toLowerCase());
              return (
                <Tr key={plan.id}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      {asset ? <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} size="sm" /> : null}
                      <span className="text-sm font-medium text-fg">{plan.symbol}</span>
                    </span>
                  </Td>
                  <Td numeric className="font-medium text-fg">{moneyExact(plan.amount)}</Td>
                  <Td>{plan.cadence}</Td>
                  <Td className={plan.active ? '' : 'text-fg-subtle'}>{plan.nextRun}</Td>
                  <Td numeric>{moneyExact(plan.invested)}</Td>
                  <Td numeric>{moneyExact(plan.averageCost)}</Td>
                  <Td>
                    <Badge tone={plan.active ? 'up' : 'neutral'}>{plan.active ? 'Active' : 'Paused'}</Badge>
                  </Td>
                  <Td numeric>
                    <button
                      type="button"
                      onClick={() => toggle(plan.id)}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1 text-2xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                    >
                      {plan.active ? <Pause className="size-3" /> : <Play className="size-3" />}
                      {plan.active ? 'Pause' : 'Resume'}
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
