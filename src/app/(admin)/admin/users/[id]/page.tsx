import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Crosshair,
  Laptop,
  MapPin,
  MonitorSmartphone,
  Radar,
  Smartphone,
  Tablet,
  TriangleAlert,
} from 'lucide-react';

import type { ActivityKind } from '@/modules/activity';
import { SECURITY_KINDS } from '@/modules/activity';
import { formatAccountNumber } from '@/modules/identity';
import { getUserDetail } from '@/server/users';
import { formatDate, formatDuration } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';

import { AdminPageHeader } from '../../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { countryFlag, countryName } from '../../live/_lib/geography';
import { WorldMap, type MapMarker } from '@/shared/ui/visuals/world-map';

import { ActivityTimeline } from './_components/activity-timeline';
import { LiveMapOverlay } from './_components/live-map-overlay';

/**
 * One account, and everything the platform has recorded about it.
 *
 * ── Three contexts on one page ─────────────────────────────────────────────────
 * Identity says who they are, presence says whether they are on the site this
 * second, activity says what they have done. They are joined in
 * `server/users.ts` — see that file for why the join is there and not in the
 * database.
 *
 * ── What is shown, and what is not ─────────────────────────────────────────────
 * No balance, no risk score, no KYC state. Those belong to contexts that do not
 * exist yet, and inventing them here is what the fixtures this page replaced were
 * doing.
 *
 * There are also no account controls — no freeze, no restrict. The page this
 * replaced had them and they wrote to an in-memory reducer that a refresh reset.
 * A control that looks like it suspends an account and does not is worse than no
 * control at all, so they are gone until the use cases behind them exist.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Account activity',
  // Nothing under /admin should be indexed, and this page in particular is a
  // named person's browsing history.
  robots: { index: false, follow: false },
};

const TABS: readonly { id: string; label: string; kinds?: readonly ActivityKind[] }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'pages', label: 'Pages', kinds: ['page-view'] },
  { id: 'security', label: 'Sign-ins & security', kinds: SECURITY_KINDS },
];

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  // Next 16: both are Promises.
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const tab = TABS.find((entry) => entry.id === query.view) ?? TABS[0]!;
  const detail = await getUserDetail(id, { kinds: tab.kinds, limit: 100 });

  // An account that does not exist and an id that is not a UUID are the same
  // answer to an operator following a stale link.
  if (detail === null) notFound();

  const { account, activity, liveTabs } = detail;
  const pageViews = activity.tallies.find((t) => t.kind === 'page-view')?.total ?? 0;
  const signIns = activity.tallies.find((t) => t.kind === 'sign-in')?.total ?? 0;
  const lastSignIn = activity.tallies.find((t) => t.kind === 'sign-in')?.lastAt ?? null;

  // Deduplicated by rounded coordinate: a hundred page views from one city are one
  // place, and plotting each would stack a hundred identical dots and make a busy
  // account look like it was everywhere.
  const seen = new Map<string, MapMarker>();
  for (const event of activity.recent.events) {
    const location = event.location;
    if (location?.latitude == null || location.longitude == null) continue;

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    const key = `${latitude.toFixed(1)}:${longitude.toFixed(1)}`;
    if (seen.has(key)) continue;

    seen.set(key, {
      id: key,
      latitude,
      longitude,
      label: [location.city, countryName(location.country)].filter(Boolean).join(', '),
      tone: 'history',
    });
  }
  const historyMarkers = [...seen.values()];

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5" />
        All accounts
      </Link>

      <AdminPageHeader
        title={account.email}
        description={`Account ${formatAccountNumber(account.accountNumber)} · ${account.id} · joined ${formatDate(account.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={account.status === 'active' ? 'up' : account.status === 'locked' ? 'warn' : 'down'}>
              {account.status}
            </Badge>
            {account.emailVerified ? (
              <Badge tone="up">Email verified</Badge>
            ) : (
              <Badge tone="neutral">Email unverified</Badge>
            )}
            {account.role === 'admin' ? <Badge tone="warn">Operator</Badge> : null}
          </div>
        }
      />

      {activity.degraded ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-sm text-fg">
            The history could not be read.{' '}
            <span className="text-fg-muted">
              This is a failed query, not an empty account — nothing below should be
              read as evidence that this person has done nothing.
            </span>
          </p>
        </div>
      ) : null}

      {/* ── On the site right now ─────────────────────────────────────────── */}
      <Panel className="mb-4">
        <PanelHeader
          title="On the site right now"
          subtitle="One row per open tab. This comes from presence, not history — it disappears when they leave."
        />
        {liveTabs.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-subtle">Not on the site.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {liveTabs.map((tab_) => (
              <li key={tab_.visitorId} className="flex flex-wrap items-center gap-3 py-3">
                <Radar
                  className={cn(
                    'size-4 shrink-0',
                    tab_.activity === 'active' ? 'animate-pulse text-up' : 'text-fg-subtle',
                  )}
                />
                <span className="font-mono text-xs text-fg">{tab_.path}</span>
                <span className="text-2xs text-fg-subtle">
                  {formatDuration(tab_.secondsOnPage)} on page
                </span>
                {tab_.location ? (
                  <span className="inline-flex items-center gap-1 text-2xs text-fg-subtle">
                    <span aria-hidden>{countryFlag(tab_.location.country)}</span>
                    {[tab_.location.city, countryName(tab_.location.country)]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                ) : null}
                <Badge tone={tab_.activity === 'active' ? 'up' : 'neutral'}>
                  {tab_.activity}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── Where they are, and where they have been ──────────────────────── */}
      <Panel className="mb-4">
        <PanelHeader
          title="Locations"
          subtitle="Where they are now on the pin, past sign-ins and page views as blue dots"
        />
        <WorldMap
          markers={historyMarkers}
          overlay={<LiveMapOverlay userId={account.id} initial={liveTabs} />}
        />
        <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
          Points are plotted where the connection resolved to, which is a city on a
          good day and a country on a bad one. A world map is the honest rendering
          of that — a pin on a street map would show a fifty-kilometre guess as a
          specific building. Positions marked <span className="text-brand-soft">device</span>{' '}
          in the history below came from the browser with the visitor&rsquo;s
          permission and are precise.
        </p>
      </Panel>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        {/* ── Devices and places ─────────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Signed in from"
            subtitle="Distinct device and network combinations, newest first"
          />
          {activity.devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">No sign-ins recorded.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {activity.devices.map((device) => (
                <li
                  key={`${device.device}-${device.browser}-${device.ipDigest}`}
                  className="flex items-start gap-3 py-3"
                >
                  <DeviceIcon device={device.device} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      {[device.browser, device.device].filter(Boolean).join(' · ') ||
                        'Unknown device'}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-fg-subtle">
                      {device.location ? (
                        <>
                          {device.location.source === 'device' ? (
                            <Crosshair className="size-3 text-brand-soft" />
                          ) : (
                            <MapPin className="size-3" />
                          )}
                          <span aria-hidden>{countryFlag(device.location.country)}</span>
                          <span>
                            {[device.location.city, countryName(device.location.country)]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </>
                      ) : (
                        <span>Location not resolved</span>
                      )}
                      <span aria-hidden className="text-fg-subtle/50">·</span>
                      <span>last {formatDate(device.lastSeenAt)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                    {device.signIns}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── Most-visited routes ────────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Where they spend their time"
            subtitle="Routes by visits, with total time on each"
          />
          {activity.topPaths.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">No page views recorded.</p>
          ) : (
            <ul className="space-y-2.5">
              {activity.topPaths.map((entry) => {
                const busiest = activity.topPaths[0]?.views ?? 1;
                return (
                  <li key={entry.path}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-mono text-xs text-fg-muted">
                        {entry.path}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-fg">
                        {entry.views}
                        <span className="ml-2 text-fg-subtle">
                          {formatDuration(entry.totalSeconds)}
                        </span>
                      </span>
                    </div>
                    <div
                      aria-hidden
                      className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-strong"
                    >
                      <div
                        className="h-full rounded-full bg-[var(--chart-1)]"
                        style={{
                          width: `${Math.max(2, Math.round((entry.views / busiest) * 100))}%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── The full timeline ──────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          title="History"
          subtitle={`${pageViews} page views · ${signIns} sign-ins${
            lastSignIn ? ` · last sign-in ${formatDate(lastSignIn)}` : ''
          }`}
          actions={
            <div className="flex items-center gap-1">
              {TABS.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/admin/users/${account.id}${entry.id === 'all' ? '' : `?view=${entry.id}`}`}
                  aria-current={entry.id === tab.id ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    entry.id === tab.id
                      ? 'bg-surface-strong text-fg'
                      : 'text-fg-muted hover:bg-surface hover:text-fg',
                  )}
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          }
        />

        <ActivityTimeline events={activity.recent.events} />

        {activity.recent.total > activity.recent.events.length ? (
          <p className="mt-4 border-t border-line pt-4 text-center text-xs text-fg-subtle">
            Showing the most recent {activity.recent.events.length} of{' '}
            {activity.recent.total}. Page views are kept for 30 days and sign-ins for
            a year — see the retention windows in the activity module.
          </p>
        ) : null}
      </Panel>
    </>
  );
}

function DeviceIcon({ device }: { device: string | null }) {
  const className = 'mt-0.5 size-4 shrink-0 text-fg-subtle';
  if (device === 'mobile') return <Smartphone className={className} />;
  if (device === 'tablet') return <Tablet className={className} />;
  if (device === 'desktop') return <Laptop className={className} />;
  return <MonitorSmartphone className={className} />;
}
