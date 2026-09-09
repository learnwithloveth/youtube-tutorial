'use client';

import { useState } from 'react';
import { Bell, BellOff, Plus, Trash2 } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { SelectField, TextField } from '@/shared/ui/primitives/field';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { ASSET_BY_ID } from '../../../_console/data/assets';
import { NOTIFICATIONS, PRICE_ALERTS } from '../../_data/data';
import { moneyExact } from '../../../_console/data/format';
import { formatPercent } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

export default function AlertsPage() {

  const [alerts, setAlerts] = useState(PRICE_ALERTS.map((a) => ({ ...a })));
  const active = alerts.filter((a) => a.active).length;

  const toggle = (id: string) =>
    setAlerts((current) => current.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
  const remove = (id: string) => setAlerts((current) => current.filter((a) => a.id !== id));

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Push arrives in under 400 ms of the book crossing your level — not on the next poll."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active alerts" value={String(active)} delta={{ value: `${alerts.length - active} muted`, direction: 'flat', period: '' }} icon={<Bell className="size-4" />} />
        <StatTile label="Triggered, 30 days" value="17" delta={{ value: 'Median 380 ms', direction: 'flat', period: 'to delivery' }} />
        <StatTile label="Unread notifications" value={String(NOTIFICATIONS.filter((n) => n.unread).length)} delta={{ value: 'Across all channels', direction: 'flat', period: '' }} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title="Price alerts" subtitle="Fire once, then mute until you re-arm them" />
          <TableShell caption="Price alerts" minWidth="42rem">
            <thead>
              <tr>
                <Th>Asset</Th><Th>Condition</Th><Th numeric>Target</Th>
                <Th numeric>Distance</Th><Th>Channel</Th><Th numeric>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <EmptyRow colSpan={6}>No alerts yet. Create one on the right.</EmptyRow>
              ) : (
                alerts.map((alert) => {
                  const asset = ASSET_BY_ID.get(alert.symbol.toLowerCase());
                  const distance = asset ? ((alert.target - asset.price) / asset.price) * 100 : 0;
                  return (
                    <Tr key={alert.id} className={cn(!alert.active && 'opacity-55')}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          {asset ? <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} size="sm" /> : null}
                          <span className="text-sm font-medium text-fg">{alert.symbol}</span>
                        </span>
                      </Td>
                      <Td className="capitalize">Price {alert.direction}</Td>
                      <Td numeric className="font-medium text-fg">{moneyExact(alert.target)}</Td>
                      <Td numeric>
                        <span className={distance >= 0 ? 'text-fg-muted' : 'text-fg-muted'}>
                          {formatPercent(distance)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone="neutral" className="capitalize">{alert.channel}</Badge>
                      </Td>
                      <Td numeric>
                        <span className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggle(alert.id)}
                            aria-label={alert.active ? `Mute ${alert.symbol} alert` : `Re-arm ${alert.symbol} alert`}
                            className="grid size-7 place-items-center rounded-sm border border-line text-fg-muted transition-colors hover:text-fg"
                          >
                            {alert.active ? <Bell className="size-3" /> : <BellOff className="size-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(alert.id)}
                            aria-label={`Delete ${alert.symbol} alert`}
                            className="grid size-7 place-items-center rounded-sm border border-line text-fg-muted transition-colors hover:border-down/50 hover:text-down"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </span>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="New alert" />
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <SelectField
                label="Asset"
                options={[
                  { value: 'btc', label: 'Bitcoin (BTC)' },
                  { value: 'eth', label: 'Ethereum (ETH)' },
                  { value: 'sol', label: 'Solana (SOL)' },
                  { value: 'tao', label: 'Bittensor (TAO)' },
                ]}
              />
              <SelectField
                label="Condition"
                options={[
                  { value: 'above', label: 'Price rises above' },
                  { value: 'below', label: 'Price falls below' },
                ]}
              />
              <TextField label="Target price" defaultValue="100000" adornment={<span className="text-xs">USD</span>} />
              <SelectField
                label="Deliver via"
                options={[
                  { value: 'both', label: 'Push and email' },
                  { value: 'push', label: 'Push only' },
                  { value: 'email', label: 'Email only' },
                ]}
              />
              <Button type="submit" size="lg" className="w-full">
                <Plus className="size-4" />
                Create alert
              </Button>
            </form>
          </Panel>

          <Panel>
            <PanelHeader title="Recent notifications" />
            <ul className="divide-y divide-line/60">
              {NOTIFICATIONS.map((note) => (
                <li key={note.id} className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      note.tone === 'up' && 'bg-up',
                      note.tone === 'brand' && 'bg-brand-soft',
                      note.tone === 'accent' && 'bg-accent',
                      note.tone === 'warn' && 'bg-warn',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', note.unread ? 'font-medium text-fg' : 'text-fg-muted')}>
                      {note.title}
                    </p>
                    <p className="text-xs text-fg-subtle">{note.body}</p>
                  </div>
                  <span className="shrink-0 text-2xs text-fg-subtle">{note.time}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
