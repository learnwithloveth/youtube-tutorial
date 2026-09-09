'use client';

import { AdminPageHeader, ConfirmButton, DangerButton } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin } from '../../_data/store';
import { money } from '../../../_console/data/format';

export default function PayoutsPage() {

  const { state, run } = useAdmin();
  const pending = state.payouts.filter((p) => p.state === 'pending');
  const held = state.payouts.filter((p) => p.state === 'held');
  const total = state.payouts.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <AdminPageHeader
        title="Referral payouts"
        description="August's run. Held rows have a stated reason — an affiliate is owed an explanation, not silence."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Run total" value={money(total)} delta={{ value: `${state.payouts.length} affiliates`, direction: 'flat', period: '' }} />
        <StatTile label="Ready to release" value={money(pending.reduce((s, p) => s + p.amount, 0))} delta={{ value: `${pending.length} rows`, direction: 'flat', period: '' }} />
        <StatTile label="Held for review" value={money(held.reduce((s, p) => s + p.amount, 0))} delta={{ value: `${held.length} flagged`, direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Approved" value={money(state.payouts.filter((p) => p.state === 'approved').reduce((s, p) => s + p.amount, 0))} delta={{ value: 'Next payment run', direction: 'flat', period: '' }} />
      </div>

      <Panel>
        <PanelHeader title="August 2026" subtitle="Paid on the fifth working day, in USDC or to a bank account" />
        <TableShell caption="Referral payouts for the period" minWidth="48rem">
          <thead>
            <tr>
              <Th>Affiliate</Th><Th numeric>Referrals</Th><Th numeric>Amount</Th>
              <Th>Flag</Th><Th>Status</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {state.payouts.map((payout) => (
              <Tr key={payout.id}>
                <Td className="font-mono text-sm text-fg">{payout.handle}</Td>
                <Td numeric>{payout.referrals}</Td>
                <Td numeric className="font-medium text-fg">{money(payout.amount)}</Td>
                <Td>
                  {payout.flagged ? (
                    <span className="block max-w-xs text-2xs leading-relaxed text-warn">{payout.flagReason}</span>
                  ) : (
                    <span className="text-2xs text-fg-subtle">Clean</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={payout.state === 'approved' ? 'up' : payout.state === 'held' ? 'down' : 'neutral'} className="capitalize">
                    {payout.state}
                  </Badge>
                </Td>
                <Td numeric>
                  {payout.state !== 'approved' ? (
                    <span className="inline-flex gap-1.5">
                      <ConfirmButton onClick={() => run({ type: 'payout/decide', id: payout.id, approve: true })}>
                        Release
                      </ConfirmButton>
                      {payout.state !== 'held' ? (
                        <DangerButton onClick={() => run({ type: 'payout/decide', id: payout.id, approve: false })}>
                          Hold
                        </DangerButton>
                      ) : null}
                    </span>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
