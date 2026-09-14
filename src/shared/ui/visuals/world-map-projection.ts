/**
 * Turning a coordinate into a position on the world map.
 *
 * ── Deliberately separate from the path data ───────────────────────────────────
 * `world-map-path.ts` is sixty kilobytes of generated coastline. A module is
 * imported whole, so putting these five lines beside it would mean any Client
 * Component that plots a point ships the entire map as JavaScript — to do
 * arithmetic. The same reason `theme-storage.ts` and the market-data barrels are
 * split out.
 *
 * Equirectangular, which is the right projection for this and not merely the
 * easy one: the points being plotted are city-level at best, the map is a
 * backdrop rather than something anyone measures, and a projection with no
 * trigonometry means a position is computable in a style attribute.
 */

export const WORLD_MAP_VIEWBOX = { width: 1000, height: 500 } as const;

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

/** Projects into the viewBox above. */
export function projectToMap(latitude: number, longitude: number): MapPoint {
  return {
    x: ((longitude + 180) / 360) * WORLD_MAP_VIEWBOX.width,
    y: ((90 - latitude) / 180) * WORLD_MAP_VIEWBOX.height,
  };
}

/**
 * The same projection as a percentage of the box.
 *
 * For overlays positioned with CSS rather than drawn inside the SVG, so a live
 * marker can animate without the map being a Client Component.
 */
export function projectToPercent(
  latitude: number,
  longitude: number,
): { left: string; top: string } {
  const point = projectToMap(latitude, longitude);
  return {
    left: `${(point.x / WORLD_MAP_VIEWBOX.width) * 100}%`,
    top: `${(point.y / WORLD_MAP_VIEWBOX.height) * 100}%`,
  };
}
