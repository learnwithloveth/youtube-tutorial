'use client';

import { useState } from 'react';
import { Activity, Send } from 'lucide-react';
import { AdminPageHeader, ConfirmButton, QuietButton } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Badge } from '@/shared/ui/primitives/badge';
import { useAdmin } from '../../_data/store';
import { SERVICE_HEALTH } from '../../_data/data';
import { dateTimeLabel } from '../../../_console/data/format';
import { cn } from '@/shared/lib/cn';

export default function SystemPage() {

  const { state, run } = useAdmin();
  const [updates, setUpdates] = useState<Record<string, string>>({});

  const open = state.incidents.filter((i) => i.state !== 'resolved');

  return (
    <>
      <AdminPageHeader
        title="Health & flags"
        description="Service status, open incidents and the rollout switches behind them."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open incidents" value={String(open.length)} delta={{ value: `${state.incidents.length} total`, direction: 'flat', period: 'this month' }} upIsGood={false} />
        <StatTile label="Services degraded" value={String(SERVICE_HEALTH.filter((s) => s.status !== 'operational').length)} delta={{ value: `of ${SERVICE_HEALTH.length}`, direction: 'flat', period: 'monitored' }} upIsGood={false} />
        <StatTile label="Flags enabled" value={String(state.flags.filter((f) => f.enabled).length)} delta={{ value: `${state.flags.length} defined`, direction: 'flat', period: '' }} />
        <StatTile label="Uptime, 90d" value="99.994%" delta={{ value: 'Across all services', direction: 'flat', period: '' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Panel>
          <PanelHeader title="Services" subtitle="Latency is the p50 over the last five minutes" />
          <ul className="divide-y divide-line/60">
            {SERVICE_HEALTH.map((service) => (
              <li key={service.name} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    service.status === 'operational' ? 'bg-up' : service.status === 'degraded' ? 'bg-warn' : 'bg-accent',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{service.name}</span>
                  <span className="block text-2xs tabular-nums text-fg-subtle">
                    {service.uptime.toFixed(3)}% · p50 {service.latencyMs < 1 ? `${service.latencyMs} ms` : `${service.latencyMs.toLocaleString('en-US')} ms`}
                  </span>
                </span>
                <Badge tone={service.status === 'operational' ? 'up' : service.status === 'degraded' ? 'warn' : 'accent'}>
                  {service.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Incidents" subtitle="Posted publicly within 15 minutes of detection" />
          <div className="space-y-4">
            {state.incidents.map((incident) => (
              <div key={incident.id} className="rounded-md border border-line bg-bg-sunken/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={incident.severity === 'sev1' || incident.severity === 'sev2' ? 'down' : incident.severity === 'sev3' ? 'warn' : 'accent'}>
                    {incident.severity}
                  </Badge>
                  <Badge tone={incident.state === 'resolved' ? 'up' : 'neutral'} className="capitalize">
                    {incident.state}
                  </Badge>
                  <span className="ml-auto text-2xs text-fg-subtle">{dateTimeLabel(incident.openedAt)}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-fg">{incident.title}</h3>
                <p className="text-2xs text-fg-subtle">{incident.service}</p>

                <ol className="mt-3 space-y-2 border-l border-line pl-4">
                  {incident.updates.map((update, i) => (
                    <li key={`${update.at}-${i}`} className="relative">
                      <span aria-hidden className="absolute -left-[1.16rem] top-1.5 size-1.5 rounded-full bg-brand-soft" />
                      <p className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                        {update.at} · {update.author}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{update.body}</p>
                    </li>
                  ))}
                </ol>

                {incident.state !== 'resolved' ? (
                  <div className="mt-4 flex gap-2">
                    <input
                      value={updates[incident.id] ?? ''}
                      onChange={(e) => setUpdates((u) => ({ ...u, [incident.id]: e.target.value }))}
                      placeholder="Post an update customers will read"
                      className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg-elev px-3 text-xs text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
                    />
                    <ConfirmButton
                      tone="brand"
                      disabled={!updates[incident.id]?.trim()}
                      onClick={() => {
                        run({ type: 'incident/update', id: incident.id, body: (updates[incident.id] ?? '').trim(), state: 'monitoring' });
                        setUpdates((u) => ({ ...u, [incident.id]: '' }));
                      }}
                    >
                      <Send className="size-3.5" />
                      Post
                    </ConfirmButton>
                    <QuietButton
                      onClick={() => run({ type: 'incident/update', id: incident.id, body: 'Resolved. A postmortem follows within five business days.', state: 'resolved' })}
                    >
                      Resolve
                    </QuietButton>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Feature flags"
          subtitle="A rollout percentage is a real dial here — moving it changes who sees the code"
        />
        <ul className="divide-y divide-line/60">
          {state.flags.map((flag) => (
            <li key={flag.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-56 flex-1">
                <p className="flex items-center gap-2 font-mono text-xs text-fg">
                  <Activity className="size-3.5 text-brand-soft" />
                  {flag.key}
                </p>
                <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">{flag.description}</p>
                <p className="mt-1 text-2xs text-fg-subtle">Owner: {flag.owner}</p>
              </div>

              <label className="flex items-center gap-3">
                <span className="sr-only">Rollout percentage for {flag.key}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={flag.rollout}
                  disabled={!flag.enabled}
                  onChange={(e) => run({ type: 'flag/rollout', id: flag.id, rollout: Number(e.target.value) })}
                  className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)] disabled:opacity-40"
                />
                <span className="w-10 text-right text-xs tabular-nums text-fg">{flag.rollout}%</span>
              </label>

              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                aria-label={`Toggle ${flag.key}`}
                onClick={() => run({ type: 'flag/toggle', id: flag.id })}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300',
                  flag.enabled ? 'border-brand-soft/60 bg-brand' : 'border-line bg-surface',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-0.5 size-4.5 rounded-full bg-white transition-transform duration-300',
                    flag.enabled ? 'translate-x-[1.4rem]' : 'translate-x-0.5',
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
