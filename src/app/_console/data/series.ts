import { hashSeed, seededRandom } from './simulation';

/**
 * Time-series generation shared by both consoles.
 *
 * Extracted from the dashboard's account fixtures because the admin console
 * builds its platform-volume charts the same way, and two copies of the anchor
 * date would let the two surfaces disagree about what "today" is.
 *
 * Everything here is generated demo data, like the rest of `_console/data`.
 * See that folder's README for why it lives outside `modules/`.
 */

export const DAY = 86_400_000;

/** Anchor so the demo reads the same on every machine and in every screenshot. */
export const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

export interface SeriesPoint {
  t: number;
  v: number;
}

/**
 * A seeded random walk ending exactly on `endValue`.
 *
 * Built backwards from today so the last point is never approximate — the
 * headline figure and the right-hand end of the chart are the same number.
 */
export function buildSeries(
  seed: string,
  days: number,
  endValue: number,
  drift = 0.38,
): SeriesPoint[] {
  const rand = seededRandom(hashSeed(seed));
  const points: SeriesPoint[] = [];
  let value = endValue;

  for (let i = 0; i < days; i += 1) {
    points.push({ t: NOW - i * DAY, v: value });
    const shock = (rand() - 0.5) * 0.028;
    const trend = drift / days;
    value = value / (1 + trend + shock);
  }

  return points.reverse();
}
