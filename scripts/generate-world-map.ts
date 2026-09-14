import { writeFileSync } from 'node:fs';

/**
 * Turns Natural Earth's world outline into a single SVG path, once.
 *
 * ── Why this is a generator and not a runtime fetch ────────────────────────────
 * The shape of the world does not change between deploys. Fetching it at render
 * time would put a CDN on the critical path of an operator's page, and shipping a
 * map library to do it would be several hundred kilobytes of pan-and-zoom
 * machinery for a picture that never pans or zooms.
 *
 * So the geometry is converted here and committed as a string constant. Re-run
 * with `pnpm map:generate` if the source ever needs updating.
 *
 * Source: world-atlas@2 `countries-110m`, derived from Natural Earth, which is
 * public domain. 110m is the coarsest of the three resolutions and is the right
 * one: the data being plotted on it is city-level at best, so a coastline more
 * precise than the points would be false detail.
 */

const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

/** The SVG coordinate space. Equirectangular, so width is exactly twice height. */
const WIDTH = 1000;
const HEIGHT = 500;

/**
 * Decimal places kept per coordinate.
 *
 * One. Zero snapped every vertex to a whole unit, which is invisible when the
 * land is a dark silhouette and obvious once it is pale with a drawn edge: the
 * stroke turns every coastline into a staircase. A tenth of a unit costs about a
 * fifth of the file and the staircase goes away.
 */
const PRECISION = 1;

/**
 * Smallest gap between consecutive points, in viewBox units.
 *
 * Radial-distance simplification: walk each ring and drop any point within this
 * distance of the last one kept. Coastlines are dense with points that land on
 * the same pixel once projected, and removing them changes nothing visible while
 * cutting the committed file substantially.
 *
 * Cheaper and blunter than Douglas-Peucker, which preserves shape better at the
 * same point count. It is not worth the extra code here: this is a backdrop for
 * dots, not a chart anyone measures.
 */
const MIN_POINT_GAP = 1.4;

/**
 * Rings smaller than this are dropped entirely, in square viewBox units.
 *
 * Minor islands render as a speck of noise at this scale and cost as much path
 * data as a small country. The threshold is bounding-box area, which is crude and
 * adequate for deciding whether something is visible at all.
 */
const MIN_RING_AREA = 1.6;

/**
 * A longitude step larger than this means the ring crossed the antimeridian.
 *
 * Natural Earth stores Russia and Fiji as rings that run off the east edge of the
 * world and continue from the west edge. Projected naively, the step from +179°
 * to -179° becomes a line straight across the map — which is exactly the streak
 * that used to cut through the Arctic and the South Pacific. No genuine coastline
 * step in 110m data comes close to half the globe, so the test is unambiguous.
 */
const WRAP_DEGREES = 180;

type Position = [number, number];

interface TopoJson {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: {
    countries: {
      geometries: {
        type: 'Polygon' | 'MultiPolygon';
        arcs: number[][] | number[][][];
      }[];
    };
  };
}

async function main(): Promise<void> {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`Source responded ${response.status}`);

  const topology = (await response.json()) as TopoJson;
  const { scale, translate } = topology.transform;

  /**
   * Decodes one arc.
   *
   * TopoJSON stores positions as *deltas* from the previous point, quantised to
   * integers — which is what makes the file small and what makes this function
   * necessary. The running sum has to happen before the transform, not after.
   */
  const decode = (index: number): Position[] => {
    const reversed = index < 0;
    // A negative index means "this arc, backwards", encoded as the ones complement.
    const arc = topology.arcs[reversed ? ~index : index];
    if (arc === undefined) return [];

    let x = 0;
    let y = 0;
    const points = arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as Position;
    });

    return reversed ? points.reverse() : points;
  };

  /** Equirectangular: longitude maps to x linearly, latitude to y, north up. */
  const project = ([lon, lat]: Position): Position => [
    ((lon + 180) / 360) * WIDTH,
    ((90 - lat) / 180) * HEIGHT,
  ];

  /**
   * Splits a ring wherever it jumps the antimeridian.
   *
   * A closed ring crosses an even number of times, so the pieces between
   * crossings always begin and end on the *same* edge of the map — which is what
   * makes closing each one with `Z` correct rather than a patch. Chukotka closes
   * down the left edge, the rest of Russia closes down the right, and neither
   * draws a line through everything in between.
   *
   * The ring's own seam (its first point, which is also its last) is not a
   * crossing, so the piece before the first jump and the piece after the last one
   * are rejoined into a single chain.
   */
  const split = (ring: Position[]): Position[][] => {
    const cuts: number[] = [];
    for (let i = 1; i < ring.length; i += 1) {
      if (Math.abs(ring[i][0] - ring[i - 1][0]) > WRAP_DEGREES) cuts.push(i);
    }
    if (cuts.length === 0) return [ring];

    const bounds = [0, ...cuts, ring.length];
    const pieces: Position[][] = [];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      pieces.push(ring.slice(bounds[i], bounds[i + 1]));
    }

    const first = pieces[0];
    const last = pieces[pieces.length - 1];
    return [[...last, ...first], ...pieces.slice(1, -1)];
  };

  /** One closed subpath, simplified, or '' if nothing worth drawing survives. */
  const subpath = (chain: Position[]): string => {
    const raw = chain.map(project);
    if (raw.length < 3) return '';

    // Radial-distance simplification, in projected space rather than in degrees —
    // a tenth of a degree is a different distance at the equator than near a pole,
    // and it is the projected result a reader actually sees.
    const kept: Position[] = [];
    let last: Position | null = null;

    for (const point of raw) {
      if (last === null || Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_POINT_GAP) {
        kept.push(point);
        last = point;
      }
    }

    if (kept.length < 3) return '';

    // The final point is kept unconditionally, because after `split` a chain's
    // endpoints are load-bearing: they sit on the map edge, and `Z` closing from
    // a point dropped short of it would lean the seam across open water.
    const end = raw[raw.length - 1];
    if (end !== kept[kept.length - 1]) kept.push(end);

    const xs = kept.map((point) => point[0]);
    const ys = kept.map((point) => point[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area < MIN_RING_AREA) return '';

    const drawn = kept
      .map(([x, y]) => `${x.toFixed(PRECISION)} ${y.toFixed(PRECISION)}`)
      .join('L');

    // `Z` closes the ring, which is what lets the whole map be one filled path
    // with `fill-rule: evenodd` rather than one element per country.
    return `M${drawn}Z`;
  };

  const ring = (arcIndexes: number[]): string =>
    split(arcIndexes.flatMap(decode)).map(subpath).join('');

  const segments: string[] = [];
  for (const geometry of topology.objects.countries.geometries) {
    if (geometry.type === 'Polygon') {
      for (const arcs of geometry.arcs as number[][]) segments.push(ring(arcs));
    } else {
      for (const polygon of geometry.arcs as number[][][]) {
        for (const arcs of polygon) segments.push(ring(arcs));
      }
    }
  }

  const path = segments.filter((segment) => segment.length > 0).join('');

  const file = `/**
 * The world's landmasses as one SVG path.
 *
 * GENERATED by \`scripts/generate-world-map.ts\` — do not edit by hand.
 *
 * Natural Earth 110m via world-atlas, public domain. Equirectangular projection
 * into the viewBox declared in \`world-map-projection.ts\`.
 *
 * ── This module holds the constant and nothing else ────────────────────────────
 * The projection helper lives next door on purpose. A module is imported whole, so
 * a Client Component that wanted \`projectToMap\` would drag the whole coastline
 * into the browser bundle to do five lines of arithmetic — the same trap the
 * market-data barrels are split to avoid.
 *
 * One path rather than one element per country, because nothing here is
 * interactive per country: it is a backdrop for plotted points.
 */

export const WORLD_MAP_PATH =
  '${path}';
`;

  const out = 'src/shared/ui/visuals/world-map-path.ts';
  writeFileSync(out, file, 'utf8');

  const rings = path.split('M').length - 1;
  console.log(`${out}: ${rings} rings, ${(path.length / 1024).toFixed(1)} KB of path`);
}

void main();
