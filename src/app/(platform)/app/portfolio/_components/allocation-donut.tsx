'use client';

import { DonutChart, type DonutSlice } from '@/shared/ui/charts/donut-chart';

import { usd } from '../../_lib/format-usd';

/**
 * The allocation donut, with its value formatter.
 *
 * ── Why the wrapper ───────────────────────────────────────────────────────────
 * `DonutChart` takes `formatValue` as a function, and the portfolio page is a
 * Server Component. A function has no representation in the RSC payload, so React
 * refuses it at render time — "Functions cannot be passed directly to Client
 * Components" — and nothing before the request catches it: TypeScript types the
 * prop as a function and knows nothing about the boundary, so `tsc` and
 * `next build` both pass.
 *
 * So the closure lives on the client side of the line and the page passes data.
 *
 * Values arrive as numbers rather than as the exact decimal strings the money rule
 * asks for, because that is `DonutChart`'s contract — a chart needs a magnitude to
 * scale an arc with, and an arc cannot be drawn in integer minor units. The
 * conversion is explicit here and at the page's own totals, and the *labels* are
 * rendered back through `usd`, so nothing arithmetic happens after the float.
 */
export function AllocationDonut({
  slices,
  centerValue,
}: {
  slices: readonly DonutSlice[];
  /** Already formatted by the page, from an exact decimal string. */
  centerValue: string;
}) {
  return (
    <DonutChart
      slices={slices}
      size={220}
      formatValue={(value) => usd(value.toFixed(2))}
      centerLabel="Priced value"
      centerValue={centerValue}
    />
  );
}
