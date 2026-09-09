'use client';

// A Client Component because it hands formatter *functions* to the charts
// below. Functions cannot cross the server/client boundary as props, so a
// Server Component doing this fails at request time rather than at build.

import { AdminPageHeader } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile, Meter } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { VALIDATORS } from '../../_data/data';
import { money } from '../../../_console/data/format';
import { formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

const REWARD_RUNS = [
  { id: 'r1', date: '2 Sep 2026, 00:00 UTC', assets: 38, accounts: 1_204_882, distributed: 412_884.12, status: 'completed' as const },
  { id: 'r2', date: '1 Sep 2026, 00:00 UTC', assets: 38, accounts: 1_201_440, distributed: 408_112.44, status: 'completed' as const },
  { id: 'r3', date: '31 Aug 2026, 00:00 UTC', assets: 37, accounts: 1_198_004, distributed: 396_240.9, status: 'partial' as const },
];

export default function AdminStakingPage() {

  const delegatedValue = 2_840_000_000;
  const jailed = VALIDATORS.filter((v) => v.status === 'jailed');

  return (
    <>
      <AdminPageHeader
        title="Staking"
        description="Validator health and the daily reward run. A jailed validator is a customer-facing incident, not an infrastructure footnote."
      />

      {jailed.length > 0 ? (
        <div className="mb-4 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <p className="text-sm text-fg">
            <span className="font-medium">{jailed.length} validator jailed</span> —{' '}
            <span className="text-fg-muted">
              {jailed.map((v) => v.name).join(', ')}. Delegations rerouted; the slashing shield covers
              the affected epoch.
            </span>
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Delegated value" value={money(delegatedValue)} delta={{ value: '38 assets', direction: 'flat', period: 'supported' }} />
        <StatTile label="Validators" value={String(VALIDATORS.length)} delta={{ value: `${VALIDATORS.filter((v) => v.status === 'healthy').length} healthy`, direction: 'flat', period: '' }} />
        <StatTile label="Distributed, 24h" value={money(412_884)} delta={{ value: '+1.2%', direction: 'up', period: 'vs yesterday' }} />
        <StatTile label="Commission" value="8%" delta={{ value: 'Flat, published', direction: 'flat', period: '' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader title="Validators" subtitle="Uptime is measured against the protocol's own attestation record" />
          <TableShell caption="Validator fleet health" minWidth="46rem">
            <thead>
              <tr>
                <Th>Validator</Th><Th>Asset</Th><Th numeric>Uptime</Th>
                <Th numeric>Delegated</Th><Th numeric>Missed</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {VALIDATORS.map((validator) => (
                <Tr key={validator.id}>
                  <Td className="font-mono text-xs text-fg">{validator.name}</Td>
                  <Td>{validator.asset}</Td>
                  <Td numeric>
                    <span className={cn(validator.uptime < 99 ? 'text-down' : validator.uptime < 99.9 ? 'text-warn' : 'text-fg-muted')}>
                      {validator.uptime.toFixed(2)}%
                    </span>
                  </Td>
                  <Td numeric>{formatQuantity(validator.delegated, 0)}</Td>
                  <Td numeric>{validator.missedBlocks.toLocaleString('en-US')}</Td>
                  <Td>
                    <Badge tone={validator.status === 'healthy' ? 'up' : validator.status === 'degraded' ? 'warn' : 'down'}>
                      {validator.status}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>

        <Panel>
          <PanelHeader title="Slashing shield" subtitle="Cover consumed against the $50M fund" />
          <div className="space-y-5">
            <Meter label="Cover used this year" value={1_840_000} max={50_000_000} formatValue={money} />
            <Meter label="Reserved for open incidents" value={620_000} max={50_000_000} formatValue={money} tone="warn" />
          </div>
          <p className="mt-5 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
            The shield covers validator faults, not market movement. A customer staking an asset that
            falls in price has not been slashed, and the fund does not make them whole.
          </p>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Reward runs" subtitle="Daily at 00:00 UTC across every supported network" />
        <TableShell caption="Recent reward distribution runs" minWidth="40rem">
          <thead>
            <tr><Th>Run</Th><Th numeric>Assets</Th><Th numeric>Accounts</Th><Th numeric>Distributed</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {REWARD_RUNS.map((run) => (
              <Tr key={run.id}>
                <Td className="font-mono text-xs text-fg">{run.date}</Td>
                <Td numeric>{run.assets}</Td>
                <Td numeric>{run.accounts.toLocaleString('en-US')}</Td>
                <Td numeric className="font-medium text-fg">{money(run.distributed)}</Td>
                <Td><Badge tone={run.status === 'completed' ? 'up' : 'warn'}>{run.status}</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
