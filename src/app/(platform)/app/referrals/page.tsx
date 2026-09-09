'use client';

import { useState } from 'react';
import { Check, Copy, Gift, Share2, Users } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { BarChart } from '@/shared/ui/charts/bar-chart';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { REFERRALS, REFERRAL_EARNINGS, REFERRAL_VOLUME } from '../../_data/data';
import { axisMoney, money, moneyExact, signedMoney } from '../../../_console/data/format';
import { formatCompact, formatDate } from '@/shared/lib/format';

const LINK = 'https://novex.io/join/amara';

/** Earnings by month — always positive here, but the same diverging form. */
const MONTHLY = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((month, i) => ({
  label: month,
  value: Math.round(REFERRAL_EARNINGS * (0.09 + i * 0.038) * 100) / 100,
}));

export default function ReferralsPage() {

  const [copied, setCopied] = useState(false);
  const active = REFERRALS.filter((r) => r.status === 'active').length;
  const tier = active >= 200 ? 'Elite · 45%' : active >= 25 ? 'Partner · 40%' : 'Standard · 30%';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(LINK);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable in some embedded contexts */
    }
  };

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Lifetime share of the trading fees your referrals generate, with attribution you can export."
        actions={
          <Button size="sm" variant="outline">
            <Share2 className="size-3.5" />
            Share
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Lifetime earned" value={money(REFERRAL_EARNINGS)} delta={{ value: `${tier}`, direction: 'up', period: 'current tier' }} icon={<Gift className="size-4" />} />
        <StatTile label="Referred traders" value={String(REFERRALS.length)} delta={{ value: `${active} active`, direction: 'up', period: 'trading this month' }} icon={<Users className="size-4" />} />
        <StatTile label="Referred volume" value={formatCompact(REFERRAL_VOLUME, 'USD')} delta={{ value: 'All time', direction: 'flat', period: '' }} />
        <StatTile label="Paid out" value={money(REFERRAL_EARNINGS * 0.78)} delta={{ value: money(REFERRAL_EARNINGS * 0.22), direction: 'flat', period: 'pending next cycle' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel>
          <PanelHeader title="Your link" subtitle="Attribution survives the whole journey, including deep links" />
          <div className="flex items-center gap-2 rounded-md border border-line bg-bg-sunken/60 p-2 pl-3.5">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{LINK}</code>
            <Button size="sm" onClick={copy} className="shrink-0">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <dl className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
            {[
              ['Clicks, 30 days', '2,841'],
              ['Signups', '96'],
              ['Verified', '71'],
              ['Conversion', '2.5%'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-fg-subtle">{k}</dt>
                <dd className="tabular-nums text-fg">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-5 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
            Brand-term paid search is the one prohibited channel — it bids up the cost of acquiring
            someone who was already looking for us.
          </p>
        </Panel>

        <ChartFrame
          title="Referral earnings by month"
          subtitle="Your share of referred trading fees"
          table={{
            columns: ['Month', 'Earned'],
            numericFrom: 1,
            rows: MONTHLY.map((m) => [m.label, money(m.value)]),
          }}
        >
          <BarChart
            bars={MONTHLY}
            height={250}
            formatValue={axisMoney}
            ariaSummary={`Referral earnings by month, totalling ${signedMoney(MONTHLY.reduce((s, m) => s + m.value, 0))}.`}
          />
        </ChartFrame>
      </div>

      <Panel>
        <PanelHeader title="Referred traders" subtitle="Raw attribution — exportable as CSV" />
        <TableShell caption="Referred traders and earnings" minWidth="40rem">
          <thead>
            <tr>
              <Th>Trader</Th><Th>Joined</Th><Th numeric>Volume</Th>
              <Th numeric>You earned</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {REFERRALS.map((ref) => (
              <Tr key={ref.id}>
                <Td className="font-mono text-sm text-fg">{ref.handle}</Td>
                <Td>{formatDate(ref.joined)}</Td>
                <Td numeric>{formatCompact(ref.volume, 'USD')}</Td>
                <Td numeric className="font-medium text-up">{moneyExact(ref.earned)}</Td>
                <Td>
                  <Badge tone={ref.status === 'active' ? 'up' : 'neutral'} className="capitalize">
                    {ref.status}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
