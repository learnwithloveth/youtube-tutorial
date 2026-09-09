'use client';

// A Client Component because it hands formatter *functions* to the charts
// below. Functions cannot cross the server/client boundary as props, so a
// Server Component doing this fails at request time rather than at build.

import { AdminPageHeader, QuietButton } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile, Meter } from '@/shared/ui/charts/stat-tile';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { DonutChart } from '@/shared/ui/charts/donut-chart';
import { Badge } from '@/shared/ui/primitives/badge';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { TREASURY } from '../../_data/data';
import { money, moneyExact } from '../../../_console/data/format';
import { formatCompact, formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

export default function TreasuryPage() {

  const total = TREASURY.reduce((s, w) => s + w.value, 0);
  const hot = TREASURY.filter((w) => w.custody === 'hot');
  const hotValue = hot.reduce((s, w) => s + w.value, 0);
  const hotRatio = (hotValue / total) * 100;

  const breach = hot.filter((w) => {
    const paired = TREASURY.find((t) => t.asset === w.asset && t.custody === 'cold');
    return paired ? w.value / (w.value + paired.value) > 0.02 : false;
  });

  const byAsset = [...new Set(TREASURY.map((w) => w.asset))]
    .map((symbol) => {
      const value = TREASURY.filter((w) => w.asset === symbol).reduce((s, w) => s + w.value, 0);
      return { key: symbol, label: symbol, value, share: (value / total) * 100 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <>
      <AdminPageHeader
        title="Treasury"
        description="Custody split, hot-float ceiling and the daily reserve attestation."
        actions={<QuietButton>Publish attestation</QuietButton>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Assets under custody" value={formatCompact(total, 'USD')} delta={{ value: '8 assets shown', direction: 'flat', period: '' }} />
        <StatTile label="Hot float" value={`${hotRatio.toFixed(2)}%`} delta={{ value: `${money(hotValue)}`, direction: 'flat', period: 'exposed' }} upIsGood={false} />
        <StatTile label="Reserve ratio" value="104.2%" delta={{ value: 'Published 3h ago', direction: 'flat', period: '' }} />
        <StatTile label="Insurance fund" value={money(250_000_000)} delta={{ value: 'Segregated', direction: 'flat', period: 'and attested' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <ChartFrame
          title="Custody by asset"
          subtitle="Cold and hot combined"
          table={{
            columns: ['Asset', 'Value', 'Share'],
            numericFrom: 1,
            rows: byAsset.map((a) => [a.label, moneyExact(a.value), `${a.share.toFixed(1)}%`]),
          }}
        >
          <DonutChart
            slices={byAsset}
            formatValue={money}
            centerLabel="Custody"
            centerValue={formatCompact(total, 'USD')}
          />
        </ChartFrame>

        <Panel>
          <PanelHeader
            title="Hot float policy"
            subtitle="Capped at 2% of custody and rebalanced hourly by policy engine, not by an operator"
          />
          <div className="space-y-5">
            <Meter label="Platform hot float" value={hotValue} max={total * 0.02} formatValue={(v) => formatCompact(v, 'USD')} tone={hotRatio > 2 ? 'warn' : 'brand'} />
            <Meter label="Cold storage" value={total - hotValue} max={total} formatValue={(v) => formatCompact(v, 'USD')} />
          </div>
          {breach.length > 0 ? (
            <p className="mt-5 rounded-md border border-warn/35 bg-warn/8 p-3 text-2xs leading-relaxed text-fg-muted">
              {breach.length} wallet{breach.length === 1 ? '' : 's'} above the 2% ceiling. The policy
              engine sweeps on the next hourly run; no operator can raise the cap.
            </p>
          ) : (
            <p className="mt-5 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
              Every wallet is inside its ceiling. Movements out of cold storage need quorum approval
              from key holders in three separate jurisdictions.
            </p>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Wallets" subtitle="Every custody address the platform controls" />
        <TableShell caption="Treasury wallets" minWidth="50rem">
          <thead>
            <tr>
              <Th>Wallet</Th><Th>Custody</Th><Th>Region</Th>
              <Th numeric>Balance</Th><Th numeric>Value</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {TREASURY.map((wallet) => (
              <Tr key={wallet.id}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <AssetMark symbol={wallet.asset} glyph={wallet.glyph} hue={wallet.hue} size="sm" />
                    <span className="text-sm font-medium text-fg">{wallet.label}</span>
                  </span>
                </Td>
                <Td>
                  <Badge tone={wallet.custody === 'cold' ? 'up' : wallet.custody === 'warm' ? 'accent' : 'warn'}>
                    {wallet.custody}
                  </Badge>
                </Td>
                <Td>{wallet.region}</Td>
                <Td numeric>{formatQuantity(wallet.balance, 4)}</Td>
                <Td numeric className={cn('font-medium', wallet.custody === 'hot' ? 'text-warn' : 'text-fg')}>
                  {formatCompact(wallet.value, 'USD')}
                </Td>
                <Td numeric>
                  <QuietButton disabled={wallet.custody === 'cold'}>Sweep</QuietButton>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
        <p className="mt-4 text-2xs leading-relaxed text-fg-subtle">
          Cold wallets cannot be swept from this console. Moving them requires the quorum ceremony,
          which is deliberately not a button.
        </p>
      </Panel>
    </>
  );
}
