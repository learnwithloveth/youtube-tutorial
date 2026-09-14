'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Globe2,
  Laptop,
  MapPin,
  MonitorSmartphone,
  Pause,
  Play,
  Smartphone,
  Tablet,
  TriangleAlert,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react';

import type { ActiveVisitorDto } from '@/modules/presence';
import type { LiveActivityView, LiveVisitorView } from '@/server/presence';
import { formatAge, formatClock, formatDuration } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../../_console/components/table';
import { countryFlag, countryName, placeLabel, SOURCE_DETAIL, SOURCE_LABEL } from '../_lib/geography';

/**
 * The live board.
 *
 * ── Why this is a Client Component and the page is not ─────────────────────────
 * The page renders the first snapshot on the server, so an operator opening the
 * console sees the board immediately rather than a spinner. It cannot re-render
 * itself on a timer, though, which is the one thing this view has to do — so the
 * refresh lives in a client island that is handed that first snapshot as props and
 * replaces it every few seconds.
 *
 * ── Every number here is an observation ────────────────────────────────────────
 * Nothing on this board is interpolated, smoothed or estimated. A visitor whose
 * location could not be resolved is counted in `unlocated` and shown with an empty
 * location cell, never placed in a plausible country — the same discipline the
 * market pages apply to a price, and for the same reason: a board an operator
 * cannot trust in the ordinary case is worth nothing in the case they opened it for.
 */

/**
 * How often the board re-reads.
 *
 * Five seconds against a twenty-second heartbeat. Faster would show the same rows
 * four times; slower and a page change an operator is watching for lands after
 * they have stopped looking. `useInterval`-style pausing while the tab is hidden is
 * handled explicitly below, so a console left open overnight costs nothing.
 */
const REFRESH_MS = 5_000;

export function LiveBoard({ initial }: { initial: LiveActivityView }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [failing, setFailing] = useState(false);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch('/api/presence/live', { cache: 'no-store', signal });
      if (!response.ok) {
        setFailing(true);
        return;
      }
      setSnapshot((await response.json()) as LiveActivityView);
      setFailing(false);
    } catch {
      // An aborted request during unmount is not a failure; anything else is, and
      // the banner says so rather than the board silently going stale.
      if (!signal.aborted) setFailing(true);
    }
  }, []);

  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (paused) return;

    let timer: number | null = null;

    const tick = () => {
      // A hidden tab is nobody watching. Browsers throttle the timer anyway; not
      // issuing the request at all means an open console in a background window
      // costs neither a query nor a row in the access log.
      if (document.visibilityState !== 'visible') {
        timer = window.setTimeout(tick, REFRESH_MS);
        return;
      }

      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;

      void refresh(next.signal).finally(() => {
        timer = window.setTimeout(tick, REFRESH_MS);
      });
    };

    timer = window.setTimeout(tick, REFRESH_MS);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      controller.current?.abort();
      controller.current = null;
    };
  }, [paused, refresh]);

  const { totals, visitors, pages, countries } = snapshot;
  const busiest = pages[0];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              paused ? 'bg-fg-subtle' : 'animate-pulse bg-up',
            )}
          />
          {paused ? 'Paused' : `Refreshing every ${REFRESH_MS / 1000}s`}
          <span className="text-fg-subtle/60">·</span>
          <span>snapshot taken {formatClock(snapshot.observedAt)} UTC</span>
        </p>

        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {snapshot.degraded ? (
        <Notice
          tone="down"
          title="The live board could not be read."
          body="This is a failure to query presence, not an empty site — the counts below are not zero, they are unknown. Check the database before drawing any conclusion from this screen."
        />
      ) : null}

      {failing && !snapshot.degraded ? (
        <Notice
          tone="warn"
          title="Refresh failed."
          body="The board below is the last snapshot that arrived, so it is older than it says. Retrying."
        />
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active right now"
          value={String(totals.active)}
          delta={{
            value: `${totals.idle} idle`,
            direction: 'flat',
            period: 'tab open, not in front',
          }}
          icon={<Users className="size-4" />}
        />
        <StatTile
          label="Signed in"
          value={String(totals.signedIn)}
          delta={{
            value: `${totals.anonymous} anonymous`,
            direction: 'flat',
            period: 'of those on the site',
          }}
          icon={<UserRound className="size-4" />}
        />
        <StatTile
          label="Located"
          value={String(totals.located)}
          delta={{
            value: `${totals.unlocated} unknown`,
            direction: 'flat',
            period: 'no location resolved',
          }}
          icon={<Globe2 className="size-4" />}
        />
        <StatTile
          label="Busiest page"
          value={busiest ? String(busiest.total) : '—'}
          delta={
            busiest
              ? { value: busiest.path, direction: 'flat', period: '' }
              : { value: 'nobody on the site', direction: 'flat', period: '' }
          }
          icon={<MonitorSmartphone className="size-4" />}
        />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Where they are"
            subtitle="Counted from the best location held for each visitor"
          />
          {countries.length === 0 ? (
            <Quiet>No visitors to place.</Quiet>
          ) : (
            <ul className="space-y-2.5">
              {countries.slice(0, 8).map((entry) => (
                <li key={entry.country ?? 'unknown'}>
                  <ShareRow
                    label={
                      <>
                        <span aria-hidden className="mr-1.5">
                          {countryFlag(entry.country)}
                        </span>
                        {countryName(entry.country)}
                      </>
                    }
                    value={entry.total}
                    max={countries[0]?.total ?? 1}
                    muted={entry.country === null}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="What they are looking at" subtitle="Active and idle, by route" />
          {pages.length === 0 ? (
            <Quiet>No pages in use.</Quiet>
          ) : (
            <ul className="space-y-2.5">
              {pages.slice(0, 8).map((entry) => (
                <li key={entry.path}>
                  <ShareRow
                    label={<span className="font-mono text-xs">{entry.path}</span>}
                    value={entry.total}
                    max={pages[0]?.total ?? 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel padded={false} className="p-5">
        <PanelHeader
          title="Everyone on the site"
          subtitle="One row per open tab — a visitor with three tabs is on three pages"
        />
        <TableShell caption="Visitors currently on the site" minWidth="62rem">
          <thead>
            <tr>
              <Th>Visitor</Th>
              <Th>Page</Th>
              <Th>Location</Th>
              <Th>Device</Th>
              <Th numeric>On page</Th>
              <Th numeric>Pages</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {visitors.length === 0 ? (
              <EmptyRow colSpan={7}>
                {snapshot.degraded
                  ? 'The board could not be read — this is not an empty site.'
                  : 'Nobody is on the site right now.'}
              </EmptyRow>
            ) : (
              visitors.map((visitor) => <VisitorRow key={visitor.visitorId} visitor={visitor} />)
            )}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}

function VisitorRow({ visitor }: { visitor: LiveVisitorView }) {
  return (
    <Tr>
      <Td>
        {visitor.account ? (
          <div className="min-w-0">
            <p className="truncate text-sm text-fg">{visitor.account.email}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-fg-subtle">
              {visitor.account.role === 'admin' ? (
                <Badge tone="warn">Operator</Badge>
              ) : null}
              {visitor.account.status !== 'active' ? (
                <Badge tone="down">{visitor.account.status}</Badge>
              ) : null}
              <span className="font-mono">{visitor.visitorId.slice(0, 8)}</span>
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">Signed out</p>
            <p className="mt-0.5 font-mono text-2xs text-fg-subtle">
              {visitor.visitorId.slice(0, 8)}
            </p>
          </div>
        )}
      </Td>

      <Td>
        <span className="font-mono text-xs text-fg">{visitor.path}</span>
      </Td>

      <Td>
        <LocationCell visitor={visitor} />
      </Td>

      <Td>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <DeviceIcon device={visitor.device} />
          <span className="text-fg-muted">
            {visitor.browser ?? DEVICE_LABEL[visitor.device]}
          </span>
        </span>
      </Td>

      <Td numeric>{formatDuration(visitor.secondsOnPage)}</Td>
      <Td numeric>{visitor.pageViews}</Td>

      <Td>
        {visitor.activity === 'active' ? (
          <Badge tone="up">Active</Badge>
        ) : (
          <Badge tone="neutral">Idle</Badge>
        )}
      </Td>
    </Tr>
  );
}

/**
 * The location cell.
 *
 * Three renderings for the three states the domain distinguishes, which is the
 * point of it being a union: an absent location is a sentence saying so, a stale
 * one keeps its age attached, and only a live one is shown plainly. Collapsing
 * them into "—" for the first two would let an hour-old fix read as where someone
 * is now.
 */
function LocationCell({ visitor }: { visitor: ActiveVisitorDto }) {
  const location = visitor.location;

  if (location === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
        <Wifi className="size-3.5" />
        Not resolved
      </span>
    );
  }

  return (
    <div className="min-w-0" title={SOURCE_DETAIL[location.source]}>
      <p className="flex items-center gap-1.5 text-sm text-fg">
        {location.source === 'device' ? (
          <Crosshair className="size-3.5 shrink-0 text-brand-soft" />
        ) : (
          <MapPin className="size-3.5 shrink-0 text-fg-subtle" />
        )}
        <span aria-hidden>{countryFlag(location.country)}</span>
        <span className="truncate">{placeLabel(location)}</span>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-fg-subtle">
        <span>{SOURCE_LABEL[location.source]}</span>
        {location.freshness === 'stale' ? (
          <span className="text-warn">· last fixed {formatAge(location.ageSeconds)}</span>
        ) : null}
        {location.source === 'device' && location.accuracyMetres !== null ? (
          <span>· ±{Math.round(location.accuracyMetres)}m</span>
        ) : null}
      </p>
    </div>
  );
}

const DEVICE_LABEL: Record<ActiveVisitorDto['device'], string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
  bot: 'Automated',
  unknown: 'Unknown',
};

function DeviceIcon({ device }: { device: ActiveVisitorDto['device'] }) {
  const className = 'size-3.5 shrink-0 text-fg-subtle';
  if (device === 'mobile') return <Smartphone className={className} />;
  if (device === 'tablet') return <Tablet className={className} />;
  if (device === 'bot') return <TriangleAlert className={cn(className, 'text-warn')} />;
  return <Laptop className={className} />;
}

/** A labelled bar. Width is a share of the largest row, so the top row fills it. */
function ShareRow({
  label,
  value,
  max,
  muted = false,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  muted?: boolean;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={cn('min-w-0 truncate', muted ? 'text-fg-subtle' : 'text-fg-muted')}>
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-fg">{value}</span>
      </div>
      <div
        aria-hidden
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-strong"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            muted ? 'bg-fg-subtle/40' : 'bg-[var(--chart-1)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-fg-subtle">{children}</p>;
}

function Notice({
  tone,
  title,
  body,
}: {
  tone: 'warn' | 'down';
  title: string;
  body: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-start gap-3 rounded-lg border px-4 py-3',
        tone === 'down' ? 'border-down/35 bg-down/8' : 'border-warn/35 bg-warn/8',
      )}
    >
      <TriangleAlert
        className={cn('mt-0.5 size-4 shrink-0', tone === 'down' ? 'text-down' : 'text-warn')}
      />
      <p className="min-w-0 text-sm text-fg">
        {title} <span className="text-fg-muted">{body}</span>
      </p>
    </div>
  );
}
