/**
 * Deterministic market simulation.
 *
 * The marketing site must feel alive on camera without shipping a socket
 * connection or leaking a production API key. We therefore drive prices from a
 * seeded PRNG: identical on every render and every machine (so screenshots and
 * SSR output stay stable) while still producing a convincing random walk.
 */

/** mulberry32 — 32-bit, fast, and good enough for visual noise. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Builds a normalised (0..1) sparkline series whose overall drift matches the
 * asset's real 7-day change, so the picture never contradicts the number.
 */
export function buildSpark(seed: string, drift: number, points = 48): number[] {
  const rand = seededRandom(hashSeed(seed));
  const volatility = Math.max(0.6, Math.abs(drift) / 6);
  const series: number[] = [];
  let value = 0;

  for (let i = 0; i < points; i += 1) {
    const trend = (drift / points) * 0.9;
    value += trend + (rand() - 0.5) * volatility;
    series.push(value);
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  return series.map((v) => (v - min) / span);
}

/** One tick of the random walk, bounded so prices never drift absurdly. */
export function tickPrice(base: number, current: number, rand: () => number): number {
  const shock = (rand() - 0.5) * base * 0.0016;
  const meanReversion = (base - current) * 0.06;
  const next = current + shock + meanReversion;
  const floor = base * 0.97;
  const ceiling = base * 1.03;
  return Math.min(ceiling, Math.max(floor, next));
}

/**
 * Picks a pseudo-random element from a non-empty list.
 *
 * `noUncheckedIndexedAccess` types every index access as possibly undefined,
 * which is correct in general and merely noise when the index is derived from
 * the array's own length. Rather than assert with `!` at every call site, the
 * check happens once here and the caller gets a definite value.
 */
export function pick<T>(items: readonly [T, ...T[]] | readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new RangeError('pick() called with an empty list');
  }
  return item;
}

/**
 * Indexes a list cyclically, returning a definite value.
 *
 * `items[i % items.length]` is always in range for a non-empty list, but
 * `noUncheckedIndexedAccess` types it as possibly undefined and has no way to
 * know better. Checking once here beats asserting at a dozen call sites.
 */
export function cycle<T>(items: readonly T[], index: number): T {
  const item = items[((index % items.length) + items.length) % items.length];
  if (item === undefined) {
    throw new RangeError('cycle() called with an empty list');
  }
  return item;
}
