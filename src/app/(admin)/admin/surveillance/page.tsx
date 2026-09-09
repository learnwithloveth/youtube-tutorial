'use client';

import { AdminPageHeader, ConfirmButton, DangerButton, EmptyState, RiskBadge } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin } from '../../_data/store';
import { dateTimeLabel, money } from '../../../_console/data/format';

const PATTERN_NOTE: Record<string, string> = {
  'Wash trading': 'Offsetting buys and sells between accounts under common control, creating volume without economic risk.',
  Spoofing: 'Large resting orders placed with no intent to fill, cancelled once the book moves toward them.',
  Layering: 'Multiple orders across price levels on one side to create a false impression of depth.',
  Ramping: 'Aggressive buying into a thin book to move the mark before selling into the move.',
  'Cross-account': 'Coordinated activity across accounts that share a device fingerprint or funding source.',
};

export default function SurveillancePage() {

  const { state, run } = useAdmin();
  const open = state.surveillance.filter((s) => s.state === 'open');

  return (
    <>
      <AdminPageHeader
        title="Surveillance"
        description="Patterns the detection models flagged. A model raises the question; a person answers it."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open alerts" value={String(open.length)} delta={{ value: `${state.surveillance.filter((s) => s.state === 'escalated').length} escalated`, direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Notional flagged" value={money(open.reduce((s, a) => s + a.notional, 0))} delta={{ value: 'Under review', direction: 'flat', period: '' }} />
        <StatTile label="Cleared this week" value={String(state.surveillance.filter((s) => s.state === 'cleared').length + 34)} delta={{ value: '92% benign', direction: 'flat', period: 'historically' }} />
        <StatTile label="Median triage" value="18m" delta={{ value: '−4m', direction: 'down', period: 'vs last week' }} upIsGood={false} />
      </div>

      {state.surveillance.length === 0 ? (
        <EmptyState title="No alerts" body="Detection is running across every market. Flagged patterns appear here for review." />
      ) : (
        <Panel>
          <TableShell caption="Market abuse alerts" minWidth="56rem">
            <thead>
              <tr>
                <Th>Pattern</Th><Th>Market</Th><Th>Account</Th>
                <Th numeric>Confidence</Th><Th numeric>Notional</Th>
                <Th>Severity</Th><Th>Detected</Th><Th numeric>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {state.surveillance.map((alert) => {
                const user = state.users.find((u) => u.id === alert.userId);
                return (
                  <Tr key={alert.id}>
                    <Td>
                      <p className="text-sm font-medium text-fg">{alert.pattern}</p>
                      <p className="mt-0.5 max-w-sm text-2xs leading-relaxed text-fg-subtle">
                        {PATTERN_NOTE[alert.pattern]}
                      </p>
                    </Td>
                    <Td className="font-mono text-xs text-fg">{alert.market}</Td>
                    <Td>{user?.handle}</Td>
                    <Td numeric>{alert.confidence}%</Td>
                    <Td numeric className="font-medium text-fg">{money(alert.notional)}</Td>
                    <Td><RiskBadge risk={alert.severity} /></Td>
                    <Td className="whitespace-nowrap">{dateTimeLabel(alert.detectedAt)}</Td>
                    <Td numeric>
                      {alert.state === 'open' ? (
                        <span className="inline-flex gap-1.5">
                          <ConfirmButton onClick={() => run({ type: 'surveillance/decide', id: alert.id, escalate: false })}>
                            Clear
                          </ConfirmButton>
                          <DangerButton onClick={() => run({ type: 'surveillance/decide', id: alert.id, escalate: true })}>
                            Escalate
                          </DangerButton>
                        </span>
                      ) : (
                        <Badge tone={alert.state === 'cleared' ? 'up' : 'down'} className="capitalize">
                          {alert.state}
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
        </Panel>
      )}
    </>
  );
}
