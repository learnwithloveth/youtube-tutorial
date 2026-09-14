import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { MAP_PIN } from './map-pin';
import { WORLD_MAP_PATH } from './world-map-path';
import { projectToMap, WORLD_MAP_VIEWBOX } from './world-map-projection';

/**
 * A world map with points plotted on it.
 *
 * ── A Server Component, deliberately ───────────────────────────────────────────
 * The coastline is ninety-six kilobytes of path data — about thirty-five over the
 * wire once compressed. Rendering it on the server means it arrives as markup the
 * browser paints once and never as JavaScript the browser parses, which is the
 * difference between a heavy page and a page that ships a map library.
 *
 * Anything that needs to move lives in `overlay`, a slot for a Client Component
 * that positions itself with CSS percentages. That way the interactive part costs
 * the projection arithmetic and nothing else.
 *
 * ── Why it looks like Google Maps ──────────────────────────────────────────────
 * Because the palette is Google's, token for token: the dark theme uses the three
 * geometry colours from Google's published `night` style, the light theme its
 * roadmap cream and water blue, and the marker is Material's `place` glyph in
 * Google red. Those live in `tokens.css` with every other colour in the product.
 *
 * ── Why it is still not a tile map ─────────────────────────────────────────────
 * Because the data does not justify one. These points come from IP geolocation,
 * which resolves a city on a good day and a country on a bad one. Dropping a pin
 * on a street map would render a fifty-kilometre guess as a specific building, and
 * the precision of the picture would be a claim the data cannot support.
 *
 * A world map with a dot says what is actually known. If a device fix ever needs
 * street-level detail, that is the point to add a tile layer — and it should be
 * visibly a different rendering, not the same one zoomed in.
 */

export interface MapMarker {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Rendered as a tooltip on the marker. */
  readonly label: string;
  readonly tone: 'live' | 'history';
}

/** How many viewBox units one pin unit is worth. Sized against the plotted dots. */
const PIN_SCALE = 1.15;

export function WorldMap({
  markers,
  overlay,
  className,
}: {
  markers: readonly MapMarker[];
  /** Slot for a Client Component that plots moving points over the same box. */
  overlay?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border border-line', className)}>
      <svg
        viewBox={`0 0 ${WORLD_MAP_VIEWBOX.width} ${WORLD_MAP_VIEWBOX.height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={
          markers.length === 0
            ? 'World map with no locations plotted'
            : `World map showing ${markers.length} ${markers.length === 1 ? 'location' : 'locations'}`
        }
      >
        {/* The ocean. A filled rectangle rather than a background colour on the
            wrapper, so the water is part of the picture and gets clipped, scaled
            and screenshotted with it. */}
        <rect
          width={WORLD_MAP_VIEWBOX.width}
          height={WORLD_MAP_VIEWBOX.height}
          fill="var(--map-water)"
        />

        <path
          d={WORLD_MAP_PATH}
          // `evenodd` is what lets one path hold every country and still cut holes
          // for inland seas rather than filling them.
          fillRule="evenodd"
          fill="var(--map-land)"
          // The stroke is doing the work of Google's administrative lines: with a
          // single filled path, abutting countries would otherwise melt into one
          // continent. It outlines coasts too, at half a pixel, which reads as an
          // edge rather than an outline.
          stroke="var(--map-land-edge)"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />

        {markers.map((marker) => {
          const { x, y } = projectToMap(marker.latitude, marker.longitude);

          if (marker.tone === 'live') {
            return (
              <g
                key={marker.id}
                // Translate first, then scale: the pin is authored with its tip at
                // (12, 22) in its own box, so the offset has to be in scaled units.
                transform={`translate(${x - MAP_PIN.tip.x * PIN_SCALE} ${y - MAP_PIN.tip.y * PIN_SCALE}) scale(${PIN_SCALE})`}
              >
                <title>{marker.label}</title>
                <path d={MAP_PIN.path} fill="var(--map-pin)" />
                <circle
                  cx={MAP_PIN.eye.x}
                  cy={MAP_PIN.eye.y}
                  r={MAP_PIN.eye.r}
                  fill="var(--map-pin-edge)"
                />
              </g>
            );
          }

          return (
            <circle
              key={marker.id}
              cx={x}
              cy={y}
              r={3.4}
              fill="var(--map-point)"
              stroke="var(--map-point-edge)"
              strokeWidth={1.2}
            >
              <title>{marker.label}</title>
            </circle>
          );
        })}
      </svg>

      {overlay}

      {/* Attribution, where a map always puts it. Natural Earth is public domain
          and asks for nothing, which is a reason to credit it rather than not. */}
      <span className="pointer-events-none absolute bottom-0 right-0 bg-(--map-land)/85 px-1.5 py-0.5 text-[9px] leading-none text-(--map-label)">
        Map data · Natural Earth
      </span>
    </div>
  );
}
