'use client';

import { useEffect, useState } from 'react';

import type { ActiveVisitorDto } from '@/modules/presence';
import { MAP_PIN } from '@/shared/ui/visuals/map-pin';
import { projectToPercent } from '@/shared/ui/visuals/world-map-projection';
import { cn } from '@/shared/lib/cn';

/**
 * The live layer over the world map.
 *
 * ── Why this is separate from the map ──────────────────────────────────────────
 * The map is a Server Component holding ninety-six kilobytes of coastline. If it
 * were a Client Component, every one of those kilobytes would ship as JavaScript
 * to make a handful of pins move. So the map renders as markup and this positions
 * itself on top with CSS percentages — importing only the projection arithmetic
 * and the pin outline, which is why each of those lives in its own module.
 *
 * ── What "realtime" honestly means here ───────────────────────────────────────
 * It polls. The underlying signal is a presence heartbeat every twenty seconds, so
 * a socket would deliver the same information with more machinery: the pin cannot
 * move more often than the browser reports, and reporting faster would be a write
 * per visitor per second for a console nobody watches continuously.
 *
 * Positions that go stale simply stop being returned — a visitor whose heartbeat
 * lapses drops off the board, and the pin disappears rather than lingering
 * somewhere they no longer are.
 */

const REFRESH_MS = 10_000;

export function LiveMapOverlay({
  userId,
  initial,
}: {
  userId: string;
  initial: readonly ActiveVisitorDto[];
}) {
  const [tabs, setTabs] = useState(initial);
  const [failing, setFailing] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    const controller = new AbortController();

    const tick = async () => {
      // A hidden tab is nobody watching. Skipping the request entirely means an
      // account page left open in a background window costs nothing.
      if (document.visibilityState !== 'visible') {
        if (!stopped) timer = window.setTimeout(tick, REFRESH_MS);
        return;
      }

      try {
        const response = await fetch(`/api/admin/users/${userId}/live`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.ok) {
          const body = (await response.json()) as { tabs: ActiveVisitorDto[] };
          if (!stopped) {
            setTabs(body.tabs);
            setFailing(false);
          }
        } else if (!stopped) {
          setFailing(true);
        }
      } catch {
        if (!stopped && !controller.signal.aborted) setFailing(true);
      }

      if (!stopped) timer = window.setTimeout(tick, REFRESH_MS);
    };

    timer = window.setTimeout(tick, REFRESH_MS);

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      controller.abort();
    };
  }, [userId]);

  const located = tabs.filter(
    (tab) => tab.location?.latitude != null && tab.location?.longitude != null,
  );

  return (
    <>
      {located.map((tab) => {
        const location = tab.location!;
        const position = projectToPercent(Number(location.latitude), Number(location.longitude));
        const place = [location.city, location.region, location.country]
          .filter(Boolean)
          .join(', ');

        return (
          <span
            key={tab.visitorId}
            // `-translate-y-full` puts the pin's *tip* on the coordinate, not its
            // centre. The viewBox in `map-pin.ts` is trimmed so that works out to
            // exactly the bottom edge — a pin balanced on its middle would be
            // pointing at somewhere half a country away.
            className="absolute -translate-x-1/2 -translate-y-full"
            style={position}
          >
            <span className="relative block">
              {tab.activity === 'active' ? (
                // Centred on the tip, behind the pin: the ripple marks the point
                // on the ground, which is not where the pin's body is.
                <span
                  aria-hidden
                  className="absolute left-1/2 top-full size-5 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-(--map-pin)/40"
                />
              ) : null}

              <svg
                viewBox={MAP_PIN.viewBox}
                width={MAP_PIN.width * 1.55}
                height={MAP_PIN.height * 1.55}
                // The shadow is Google's separation trick and does the job a white
                // outline would, without blunting the tip against the viewBox edge.
                className={cn(
                  'relative block drop-shadow-[0_1px_2px_rgb(0_0_0/0.45)]',
                  tab.activity === 'active' ? 'opacity-100' : 'opacity-70',
                )}
                aria-hidden
              >
                <path d={MAP_PIN.path} fill="var(--map-pin)" />
                <circle
                  cx={MAP_PIN.eye.x}
                  cy={MAP_PIN.eye.y}
                  r={MAP_PIN.eye.r}
                  fill="var(--map-pin-edge)"
                />
              </svg>

              {/* The place name, not a tooltip: an operator should not have to
                  discover by hovering that the pin is labelled. */}
              {place.length > 0 ? (
                <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-(--map-land)/95 px-1.5 py-0.5 text-[10px] font-medium leading-none text-(--map-label) ring-1 ring-(--map-land-edge)">
                  {place}
                </span>
              ) : null}
            </span>
          </span>
        );
      })}

      {/* Kept clear of the attribution in the opposite corner. */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-32 flex flex-wrap items-center gap-2 p-2 text-2xs">
        <span className="flex items-center gap-1.5 rounded bg-(--map-land)/90 px-1.5 py-0.5 ring-1 ring-(--map-land-edge)">
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              failing
                ? 'bg-warn'
                : located.length > 0
                  ? 'animate-pulse bg-(--map-pin)'
                  : 'bg-(--map-label)',
            )}
          />
          <span className="text-(--map-label)">
            {failing
              ? 'Live position could not be refreshed'
              : located.length === 0
                ? tabs.length > 0
                  ? 'On the site, but their location could not be resolved'
                  : 'Not on the site right now'
                : `${located.length} live ${located.length === 1 ? 'position' : 'positions'} · refreshing every ${REFRESH_MS / 1000}s`}
          </span>
        </span>
      </div>
    </>
  );
}
