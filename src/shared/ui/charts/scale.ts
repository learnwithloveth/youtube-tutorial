/** Chart maths shared by every mark. Pure functions, no React, no DOM. */

export interface Scale {
  (value: number): number;
  invert(pixel: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  fn.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/**
 * Round tick values so the axis reads 0 / 1,000 / 2,000 rather than 0 / 1,037.
 * Returns ticks covering the domain, and the padded domain they imply.
 */
export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; domain: [number, number] } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const base = Number.isFinite(min) ? min : 0;
    return { ticks: [base], domain: [base - 1, base + 1] };
  }
  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;

  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Guard against float drift accumulating across many steps.
  for (let i = 0; start + i * step <= end + step * 1e-9; i += 1) ticks.push(Number((start + i * step).toPrecision(12)));
  return { ticks, domain: [start, end] };
}

/**
 * Catmull-Rom through the points, emitted as cubic Béziers.
 * Smooth without the overshoot a naive spline gives on volatile series.
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M ${first[0]} ${first[1]}`;

  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    // Guarded rather than asserted: `noUncheckedIndexedAccess` is on, and an
    // index is not a proof. The loop bound makes this unreachable.
    if (!p1 || !p2) break;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }

  return d;
}

export function stepPath(points: readonly (readonly [number, number])[]): string {
  const first = points[0];
  if (!first) return '';

  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;
  for (const point of points.slice(1)) {
    d += ` H ${point[0].toFixed(2)} V ${point[1].toFixed(2)}`;
  }
  return d;
}

/** Arc path for a donut segment, drawn clockwise from 12 o'clock. */
export function arcPath(
  cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number,
): string {
  const toXY = (r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x0, y0] = toXY(rOuter, startDeg);
  const [x1, y1] = toXY(rOuter, endDeg);
  const [x2, y2] = toXY(rInner, endDeg);
  const [x3, y3] = toXY(rInner, startDeg);
  return [
    `M ${x0.toFixed(2)} ${y0.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** The fixed categorical order. Slots are assigned in sequence, never cycled. */
export const CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export const OTHER_SLOT = 'var(--fg-subtle)';

/** Slot for index `i`; anything past the ramp folds into the neutral Other slot. */
export function categorical(i: number): string {
  return CATEGORICAL[i] ?? OTHER_SLOT;
}
