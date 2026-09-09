'use client';

import { useState } from 'react';
import { Check, Percent, Plus } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, QuietButton } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { money } from '../../../_console/data/format';

interface Tier {
  id: string;
  name: string;
  volume: number;
  maker: number;
  taker: number;
  accounts: number;
}

const INITIAL: Tier[] = [
  { id: 't1', name: 'Base', volume: 0, maker: 0.02, taker: 0.1, accounts: 38_412_004 },
  { id: 't2', name: 'Silver', volume: 50_000, maker: 0.015, taker: 0.08, accounts: 2_140_882 },
  { id: 't3', name: 'Gold', volume: 500_000, maker: 0.008, taker: 0.05, accounts: 604_118 },
  { id: 't4', name: 'Platinum', volume: 5_000_000, maker: 0, taker: 0.04, accounts: 44_206 },
  { id: 't5', name: 'Prime', volume: 50_000_000, maker: -0.005, taker: 0.03, accounts: 5_674 },
];

const PROMOS = [
  { id: 'p1', name: 'New account, 30 days commission-free', scope: 'Top 20 pairs', ends: '31 Dec 2026', active: true },
  { id: 'p2', name: 'Maker rebate boost — ONDO-USD', scope: 'ONDO-USD only', ends: '30 Sep 2026', active: true },
  { id: 'p3', name: 'Institutional onboarding waiver', scope: 'Desk accounts', ends: '—', active: false },
];

export default function AdminFeesPage() {

  const [tiers, setTiers] = useState(INITIAL);
  const [draft, setDraft] = useState<Tier[] | null>(null);

  const rows = draft ?? tiers;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(tiers);

  const edit = (id: string, field: 'maker' | 'taker', value: number) =>
    setDraft((current) => (current ?? tiers).map((t) => (t.id === id ? { ...t, [field]: value } : t)));

  return (
    <>
      <AdminPageHeader
        title="Fees & tiers"
        description="The published schedule. A change here requires 30 days' notice to customers before it takes effect."
        actions={
          draft ? (
            <>
              <ConfirmButton
                disabled={!dirty}
                onClick={() => {
                  if (draft) setTiers(draft);
                  setDraft(null);
                }}
              >
                <Check className="size-3.5" />
                Stage change
              </ConfirmButton>
              <QuietButton onClick={() => setDraft(null)}>Discard</QuietButton>
            </>
          ) : (
            <QuietButton onClick={() => setDraft(tiers.map((t) => ({ ...t })))}>
              <Percent className="size-3.5" />
              Edit schedule
            </QuietButton>
          )
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Blended take rate" value="0.062%" delta={{ value: '−0.004pp', direction: 'down', period: 'vs last quarter' }} upIsGood={false} />
        <StatTile label="Fee revenue, 30d" value={money(41_882_400)} delta={{ value: '+6.1%', direction: 'up', period: 'month over month' }} />
        <StatTile label="Rebates paid" value={money(2_140_800)} delta={{ value: 'To Prime makers', direction: 'flat', period: '' }} />
        <StatTile label="Accounts at Prime" value="5,674" delta={{ value: '+218', direction: 'up', period: 'this month' }} />
      </div>

      <Panel className="mb-4">
        <PanelHeader
          title="Volume tiers"
          subtitle="Recalculated hourly on trailing 30-day notional. Moving up applies immediately; moving down waits for the daily boundary."
        />
        <TableShell caption="Fee tiers by 30-day volume" minWidth="46rem">
          <thead>
            <tr>
              <Th>Tier</Th><Th numeric>30-day volume</Th>
              <Th numeric>Maker</Th><Th numeric>Taker</Th><Th numeric>Accounts</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tier) => (
              <Tr key={tier.id}>
                <Td className="font-medium text-fg">{tier.name}</Td>
                <Td numeric>≥ {money(tier.volume)}</Td>
                <Td numeric>
                  {draft ? (
                    <input
                      type="number"
                      step="0.001"
                      value={tier.maker}
                      onChange={(e) => edit(tier.id, 'maker', Number(e.target.value))}
                      className="h-7 w-20 rounded-sm border border-line bg-bg-sunken px-2 text-right text-xs tabular-nums text-fg outline-none focus:border-brand-soft"
                    />
                  ) : (
                    <span className={tier.maker <= 0 ? 'text-up' : ''}>{tier.maker.toFixed(3)}%</span>
                  )}
                </Td>
                <Td numeric>
                  {draft ? (
                    <input
                      type="number"
                      step="0.001"
                      value={tier.taker}
                      onChange={(e) => edit(tier.id, 'taker', Number(e.target.value))}
                      className="h-7 w-20 rounded-sm border border-line bg-bg-sunken px-2 text-right text-xs tabular-nums text-fg outline-none focus:border-brand-soft"
                    />
                  ) : (
                    `${tier.taker.toFixed(3)}%`
                  )}
                </Td>
                <Td numeric>{tier.accounts.toLocaleString('en-US')}</Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
        {dirty ? (
          <p className="mt-4 rounded-md border border-warn/35 bg-warn/8 p-3 text-2xs leading-relaxed text-fg-muted">
            Staging a change starts the 30-day customer notice. Nothing takes effect until the notice
            period elapses, and the schedule page updates the moment it is staged.
          </p>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader
          title="Promotions"
          actions={<QuietButton><Plus className="size-3.5" />New promotion</QuietButton>}
        />
        <TableShell caption="Active fee promotions" minWidth="38rem">
          <thead>
            <tr><Th>Promotion</Th><Th>Scope</Th><Th>Ends</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {PROMOS.map((promo) => (
              <Tr key={promo.id}>
                <Td className="font-medium text-fg">{promo.name}</Td>
                <Td>{promo.scope}</Td>
                <Td>{promo.ends}</Td>
                <Td><Badge tone={promo.active ? 'up' : 'neutral'}>{promo.active ? 'Active' : 'Ended'}</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
