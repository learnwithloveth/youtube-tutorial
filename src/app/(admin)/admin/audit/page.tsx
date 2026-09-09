'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Download, Search, ShieldCheck } from 'lucide-react';
import { AdminPageHeader, QuietButton } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { useAdmin } from '../../_data/store';
import { dateTimeLabel } from '../../../_console/data/format';
import { cn } from '@/shared/lib/cn';

const SEVERITIES = ['all', 'critical', 'notice', 'info'] as const;

export default function AuditPage() {

  const { state } = useAdmin();
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('all');
  const deferred = useDeferredValue(query);

  const rows = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    return state.audit.filter((entry) => {
      const matchesSeverity = severity === 'all' || entry.severity === severity;
      const matchesQuery =
        !needle ||
        entry.action.toLowerCase().includes(needle) ||
        entry.actor.toLowerCase().includes(needle) ||
        entry.target.toLowerCase().includes(needle) ||
        entry.detail.toLowerCase().includes(needle);
      return matchesSeverity && matchesQuery;
    });
  }, [state.audit, deferred, severity]);

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every privileged action, written by the same transition that changed the record. There is no path through this console that mutates something without appearing here."
        actions={<QuietButton><Download className="size-3.5" />Export</QuietButton>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Entries" value={String(state.audit.length)} delta={{ value: 'This session', direction: 'flat', period: '' }} />
        <StatTile label="Critical" value={String(state.audit.filter((e) => e.severity === 'critical').length)} delta={{ value: 'Account and fund movements', direction: 'flat', period: '' }} upIsGood={false} />
        <StatTile label="Distinct actors" value={String(new Set(state.audit.map((e) => e.actor)).size)} delta={{ value: 'Including system', direction: 'flat', period: '' }} />
        <StatTile label="Retention" value="7 years" delta={{ value: 'Append-only', direction: 'flat', period: 'storage' }} />
      </div>

      <Panel>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative w-full max-w-xs">
            <span className="sr-only">Search the audit log</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Action, actor, target or detail"
              className="h-9 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
            />
          </label>
          <div className="flex gap-1.5">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                aria-pressed={severity === s}
                className={cn(
                  'rounded-full border px-3 py-1 text-2xs capitalize transition-colors',
                  severity === s
                    ? 'border-brand-soft/60 bg-brand/15 text-fg'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <TableShell caption="Privileged action audit log" minWidth="54rem">
          <thead>
            <tr>
              <Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={5}>Nothing matches those filters.</EmptyRow>
            ) : (
              rows.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="whitespace-nowrap">{dateTimeLabel(entry.at)}</Td>
                  <Td className="text-fg">{entry.actor}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 rounded-full',
                          entry.severity === 'critical' ? 'bg-down' : entry.severity === 'notice' ? 'bg-warn' : 'bg-fg-subtle',
                        )}
                      />
                      <span className="font-mono text-xs text-brand-soft">{entry.action}</span>
                    </span>
                  </Td>
                  <Td className="font-mono text-xs">{entry.target}</Td>
                  <Td className="max-w-md text-2xs leading-relaxed">{entry.detail}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableShell>

        <p className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-2xs text-fg-subtle">
          <ShieldCheck className="size-3 text-up" />
          Entries are append-only and hash-chained. An operator cannot edit or delete their own trail.
        </p>
      </Panel>
    </>
  );
}
