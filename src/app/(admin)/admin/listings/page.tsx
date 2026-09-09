'use client';

import { useState } from 'react';
import { CirclePause, CirclePlay, Trash2 } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, DangerButton, QuietButton } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { useAdmin } from '../../_data/store';
import { formatCompact, formatDate } from '@/shared/lib/format';
import type { Listing } from '../../_data/types';

const STATUS_TONE: Record<Listing['status'], 'up' | 'warn' | 'down' | 'accent'> = {
  live: 'up', paused: 'warn', delisted: 'down', review: 'accent',
};

export default function ListingsPage() {

  const { state, run } = useAdmin();
  const [editing, setEditing] = useState<string | null>(null);
  const [maker, setMaker] = useState(2);
  const [taker, setTaker] = useState(10);

  const startEdit = (listing: Listing) => {
    setEditing(listing.id);
    setMaker(listing.makerBps);
    setTaker(listing.takerBps);
  };

  return (
    <>
      <AdminPageHeader
        title="Listings"
        description="Pausing a market stops matching immediately and cancels resting orders. It is the loudest control in this console."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Live markets" value={String(state.listings.filter((l) => l.status === 'live').length)} delta={{ value: `${state.listings.length} configured`, direction: 'flat', period: '' }} />
        <StatTile label="Paused" value={String(state.listings.filter((l) => l.status === 'paused').length)} delta={{ value: 'Matching halted', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="In listing review" value={String(state.listings.filter((l) => l.status === 'review').length)} delta={{ value: 'Awaiting risk sign-off', direction: 'flat', period: '' }} />
        <StatTile label="24h volume" value={formatCompact(state.listings.reduce((s, l) => s + l.volume24h, 0), 'USD')} delta={{ value: 'Across listed markets', direction: 'flat', period: '' }} />
      </div>

      <Panel>
        <TableShell caption="Listed markets and their fee overrides" minWidth="58rem">
          <thead>
            <tr>
              <Th>Market</Th><Th>Sector</Th><Th>Status</Th>
              <Th numeric>24h volume</Th><Th numeric>Maker</Th><Th numeric>Taker</Th>
              <Th>Listed</Th><Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {state.listings.map((listing) => (
              <Tr key={listing.id}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <AssetMark symbol={listing.symbol} glyph={listing.glyph} hue={listing.hue} size="sm" />
                    <span>
                      <span className="block text-sm font-medium text-fg">{listing.symbol}-USD</span>
                      <span className="block text-2xs text-fg-subtle">{listing.name}</span>
                    </span>
                  </span>
                </Td>
                <Td>{listing.category}</Td>
                <Td><Badge tone={STATUS_TONE[listing.status]} className="capitalize">{listing.status}</Badge></Td>
                <Td numeric>{formatCompact(listing.volume24h, 'USD')}</Td>
                <Td numeric>
                  {editing === listing.id ? (
                    <input
                      type="number"
                      value={maker}
                      onChange={(e) => setMaker(Number(e.target.value))}
                      className="h-7 w-16 rounded-sm border border-line bg-bg-sunken px-2 text-right text-xs tabular-nums text-fg outline-none focus:border-brand-soft"
                    />
                  ) : (
                    `${listing.makerBps} bps`
                  )}
                </Td>
                <Td numeric>
                  {editing === listing.id ? (
                    <input
                      type="number"
                      value={taker}
                      onChange={(e) => setTaker(Number(e.target.value))}
                      className="h-7 w-16 rounded-sm border border-line bg-bg-sunken px-2 text-right text-xs tabular-nums text-fg outline-none focus:border-brand-soft"
                    />
                  ) : (
                    `${listing.takerBps} bps`
                  )}
                </Td>
                <Td className="whitespace-nowrap">{formatDate(listing.listedOn)}</Td>
                <Td numeric>
                  <span className="inline-flex gap-1.5">
                    {editing === listing.id ? (
                      <>
                        <ConfirmButton
                          onClick={() => {
                            run({ type: 'listing/setFees', id: listing.id, makerBps: maker, takerBps: taker });
                            setEditing(null);
                          }}
                        >
                          Save fees
                        </ConfirmButton>
                        <QuietButton onClick={() => setEditing(null)}>Cancel</QuietButton>
                      </>
                    ) : (
                      <>
                        <QuietButton onClick={() => startEdit(listing)}>Fees</QuietButton>
                        {listing.status === 'live' ? (
                          <QuietButton onClick={() => run({ type: 'listing/setStatus', id: listing.id, status: 'paused' })}>
                            <CirclePause className="size-3.5" />
                            Pause
                          </QuietButton>
                        ) : (
                          <ConfirmButton onClick={() => run({ type: 'listing/setStatus', id: listing.id, status: 'live' })}>
                            <CirclePlay className="size-3.5" />
                            Resume
                          </ConfirmButton>
                        )}
                        <DangerButton onClick={() => run({ type: 'listing/setStatus', id: listing.id, status: 'delisted' })}>
                          <Trash2 className="size-3.5" />
                        </DangerButton>
                      </>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}
