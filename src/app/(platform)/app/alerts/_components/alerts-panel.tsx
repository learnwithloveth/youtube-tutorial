'use client';

import { useActionState, useState } from 'react';
import { Bell, BellOff, Plus, Trash2 } from 'lucide-react';

import type { PriceAlertDto } from '@/modules/alerts';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatPrice } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../../_console/components/table';
import { createAlertAction, moveAlertAction } from '../_lib/actions';
import { IDLE_ALERT_FORM, IDLE_ALERT_MOVE } from '../_lib/form-state';

/**
 * The alert table and the form beside it.
 *
 * ── Distance is only shown where there is a price ─────────────────────────────
 * `prices` carries only the symbols that currently have a live or stale quote. A
 * symbol missing from it renders a dash, not a zero: "0.00%" beside an alert would
 * say the market is sitting exactly on the level, which is the one reading that
 * would make somebody act.
 */

export function AlertsPanel({
  alerts,
  prices,
  symbols,
  disabled,
}: {
  alerts: readonly PriceAlertDto[];
  prices: Readonly<Record<string, string>>;
  symbols: readonly string[];
  disabled: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5">
          <PanelHeader
            title="Price alerts"
            subtitle="Fire once, then wait until you re-arm them"
          />
        </div>

        <TableShell caption="Price alerts" minWidth="40rem">
          <thead>
            <tr>
              <Th>Asset</Th>
              <Th>Condition</Th>
              <Th numeric>Target</Th>
              <Th numeric>Distance</Th>
              <Th>State</Th>
              <Th numeric>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <EmptyRow colSpan={6}>No alerts yet. Set one below.</EmptyRow>
            ) : (
              alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} price={prices[alert.symbol] ?? null} />
              ))
            )}
          </tbody>
        </TableShell>
      </Panel>

      <NewAlertForm symbols={symbols} disabled={disabled} />
    </div>
  );
}

function AlertRow({ alert, price }: { alert: PriceAlertDto; price: string | null }) {
  const [state, submit, pending] = useActionState(moveAlertAction, IDLE_ALERT_MOVE);

  // Computed in `number` space, and only here: this is a percentage for a person
  // to glance at, never a value that is stored or compared. The exact strings stay
  // exact in the columns either side of it.
  const distance =
    price === null ? null : ((Number(alert.target) - Number(price)) / Number(price)) * 100;

  return (
    <Tr className={cn(alert.status !== 'armed' && 'opacity-60')}>
      <Td>
        <span className="text-sm font-medium text-fg">{alert.symbol}</span>
      </Td>
      <Td className="capitalize">Price {alert.direction}</Td>
      <Td numeric className="font-medium text-fg">
        {formatPrice(alert.target)}
      </Td>
      <Td numeric>
        {distance === null ? (
          <span className="text-fg-subtle" title="No quote for this market right now">
            —
          </span>
        ) : (
          <span className="text-fg-muted">{formatPercent(distance)}</span>
        )}
      </Td>
      <Td>
        {alert.status === 'armed' ? (
          <Badge tone="up">Watching</Badge>
        ) : alert.status === 'triggered' ? (
          <Badge tone="accent">Fired</Badge>
        ) : (
          <Badge tone="neutral">Muted</Badge>
        )}
      </Td>
      <Td numeric>
        <form action={submit} className="inline-flex items-center gap-1.5">
          <input type="hidden" name="id" value={alert.id} />
          <button
            type="submit"
            name="action"
            value={alert.status === 'armed' ? 'mute' : 'rearm'}
            disabled={pending}
            title={alert.status === 'armed' ? 'Stop watching' : 'Watch again'}
            className="grid size-7 place-items-center rounded-md border border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            {alert.status === 'armed' ? (
              <BellOff className="size-3.5" />
            ) : (
              <Bell className="size-3.5" />
            )}
            <span className="sr-only">
              {alert.status === 'armed' ? 'Mute' : 'Re-arm'} the {alert.symbol} alert
            </span>
          </button>
          <button
            type="submit"
            name="action"
            value="delete"
            disabled={pending}
            className="grid size-7 place-items-center rounded-md border border-line text-fg-subtle transition-colors hover:border-down/60 hover:text-down disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete the {alert.symbol} alert</span>
          </button>
          {state.id === alert.id && state.status === 'error' ? (
            <span className="text-2xs text-down">{state.message}</span>
          ) : null}
        </form>
      </Td>
    </Tr>
  );
}

function NewAlertForm({
  symbols,
  disabled,
}: {
  symbols: readonly string[];
  disabled: boolean;
}) {
  const [state, submit, pending] = useActionState(createAlertAction, IDLE_ALERT_FORM);
  const [symbol, setSymbol] = useState(symbols[0] ?? '');

  return (
    <Panel>
      <PanelHeader title="New alert" subtitle="Checked each time fresh prices arrive" />

      <form action={submit} className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Asset</span>
          <select
            name="symbol"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            disabled={disabled || symbols.length === 0}
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand-soft disabled:opacity-40"
          >
            {/* Only what this platform quotes. An alert on anything else would sit
                armed forever and read as the feature being broken. */}
            {symbols.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Condition</span>
          <select
            name="direction"
            defaultValue="above"
            disabled={disabled}
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-brand-soft disabled:opacity-40"
          >
            <option value="above">Price rises above</option>
            <option value="below">Price falls below</option>
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Target price (USD)</span>
          <input
            name="target"
            required
            inputMode="decimal"
            // Typed as text and parsed exactly: `type="number"` hands back a float
            // and would round a sub-cent target before it ever reached the server.
            pattern="[0-9]*\.?[0-9]*"
            placeholder="100000"
            disabled={disabled}
            className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft disabled:opacity-40"
          />
        </label>

        <div className="flex items-center gap-3 sm:col-span-3">
          <button
            type="submit"
            disabled={pending || disabled}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-soft/40 bg-brand/12 px-3 py-1.5 text-xs font-medium text-brand-soft transition-colors hover:border-brand-soft/70 hover:bg-brand/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            {pending ? 'Saving…' : 'Create alert'}
          </button>

          {state.message === null ? null : (
            <span
              className={cn('text-xs', state.status === 'error' ? 'text-down' : 'text-up')}
              role={state.status === 'error' ? 'alert' : undefined}
            >
              {state.message}
            </span>
          )}
        </div>
      </form>
    </Panel>
  );
}
