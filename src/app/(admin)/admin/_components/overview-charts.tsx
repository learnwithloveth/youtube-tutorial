'use client';

import { AreaChart } from '@/shared/ui/charts/area-chart';
import { BarChart } from '@/shared/ui/charts/bar-chart';

import { dayLabel } from '../../../_console/data/format';

/**
 * The command centre's two charts, with their axis formatters.
 *
 * ── Why this file exists ───────────────────────────────────────────────────────
 * `AreaChart` and `BarChart` take `formatValue` and `formatX` as functions, which
 * is the right shape for a chart: an axis label is a decision about presentation
 * and belongs to the caller, not to the renderer.
 *
 * It stops working the moment the caller is a Server Component. A function cannot
 * cross the server/client boundary — there is nothing to serialise into the RSC
 * payload — and React refuses at render time with "Functions cannot be passed
 * directly to Client Components". The command centre used to be `'use client'`, so
 * it passed closures freely; making it a Server Component broke that.
 *
 * Nothing catches it before the request. TypeScript types the prop as a function
 * and knows nothing about the boundary, so `tsc` and `next build` both pass and
 * the page fails on first render.
 *
 * So the formatters live on the client side of the boundary, here, and the page
 * passes plain data across. That is the same rule as `'use client'` on the
 * smallest leaf, applied to a closure instead of a component.
 */

const integer = (value: number) => Math.round(value).toLocaleString('en-US');

export function ActivityChart({ data }: { data: readonly { t: number; v: number }[] }) {
  return (
    <AreaChart
      data={data}
      height={240}
      label="Events"
      formatValue={integer}
      formatX={dayLabel}
      ariaSummary="Recorded activity events per day over the last 30 days."
    />
  );
}

export function DecisionsChart({ bars }: { bars: readonly { label: string; value: number }[] }) {
  return (
    <BarChart
      bars={bars}
      height={240}
      formatValue={(value) => String(Math.round(value))}
      ariaSummary="Deposit and withdrawal decisions per day over the last seven days."
    />
  );
}
