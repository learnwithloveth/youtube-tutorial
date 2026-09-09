/**
 * Illustrative uptime history for the status page.
 *
 * These ninety bars are **generated, not measured**. There is no uptime
 * telemetry behind this site, and the page is a design demonstration of what a
 * status page looks like — the footer disclaimer states plainly that Novex is a
 * fictional exchange.
 *
 * Two deliberate constraints keep that honest:
 *
 * 1. It lives here, in the status page's private `_lib`, and not in the
 *    market-data module or anywhere a price could reach. Generated figures must
 *    never sit next to observed ones where the two could be confused, and the
 *    original shipped this alongside the price simulation, which is exactly that
 *    confusion.
 * 2. It is deterministic. The same seed gives the same bars on the server and
 *    the client, so the page hydrates without mismatching, and a screenshot
 *    taken today matches one taken next week.
 *
 * If real telemetry ever backs this page, this file is deleted rather than
 * adapted.
 */

export type BarTone = 'up' | 'warn' | 'accent';
export type ServiceHealth = 'operational' | 'degraded' | 'maintenance';

/** mulberry32 — small, fast, and deterministic from its seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const DAYS = 90;

export function buildUptimeBars(seed: string, health: ServiceHealth): BarTone[] {
  const random = seededRandom(hashSeed(seed));

  return Array.from({ length: DAYS }, (_, index) => {
    const roll = random();
    // The most recent few days reflect the service's stated current health, so
    // the bars and the status badge never contradict each other.
    if (index > DAYS - 4 && health !== 'operational') {
      return health === 'degraded' ? 'warn' : 'accent';
    }
    return roll > 0.985 ? 'warn' : 'up';
  });
}
