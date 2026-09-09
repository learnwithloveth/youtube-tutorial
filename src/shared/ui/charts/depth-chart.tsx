'use client';

import { useMemo } from 'react';
import { linearScale, stepPath } from './scale';
import { useChartSize } from './use-chart-size';
import type { BookLevel } from './types';

const M = { top: 10, right: 10, bottom: 22, left: 10 };

/**
 * Cumulative order-book depth either side of the mid.
 *
 * Step paths, not smoothed curves: depth changes discretely at each price level,
 * and interpolating between levels would draw liquidity that does not exist.
 */
export function DepthChart({
  bids, asks, mid, height = 150, formatPrice,
}: {
  bids: readonly BookLevel[];
  asks: readonly BookLevel[];
  mid: number;
  height?: number;
  formatPrice: (v: number) => string;
}) {
  const { ref, width } = useChartSize<HTMLDivElement>();
  const plotW = Math.max(80, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;

  const { bidPath, askPath, bidLine, askLine, lo, hi, midX } = useMemo(() => {
    const prices = [...bids.map((b) => b.price), ...asks.map((a) => a.price)];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const maxTotal = Math.max(...bids.map((b) => b.total), ...asks.map((a) => a.total));
    const x = linearScale([min, max], [M.left, M.left + plotW]);
    const y = linearScale([0, maxTotal], [M.top + plotH, M.top]);

    const bidPts = [...bids].reverse().map((b) => [x(b.price), y(b.total)] as const);
    const askPts = asks.map((a) => [x(a.price), y(a.total)] as const);
    const base = M.top + plotH;

    const close = (pts: readonly (readonly [number, number])[]) =>
      ((): string => {
        const start = pts[0];
        const end = pts[pts.length - 1];
        if (!start || !end) return '';
        return `${stepPath(pts)} L ${end[0]} ${base} L ${start[0]} ${base} Z`;
      })();

    return {
      bidPath: close(bidPts),
      askPath: close(askPts),
      bidLine: stepPath(bidPts),
      askLine: stepPath(askPts),
      lo: min,
      hi: max,
      midX: x(mid),
    };
  }, [bids, asks, mid, plotW, plotH]);

  return (
    <div ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Cumulative depth from ${formatPrice(lo)} to ${formatPrice(hi)}, mid ${formatPrice(mid)}.`}
      >
        <path d={bidPath} fill="var(--up)" opacity="0.14" />
        <path d={askPath} fill="var(--down)" opacity="0.14" />
        <path d={bidLine} fill="none" stroke="var(--up)" strokeWidth="2" strokeLinejoin="round" />
        <path d={askLine} fill="none" stroke="var(--down)" strokeWidth="2" strokeLinejoin="round" />

        <line
          x1={midX}
          x2={midX}
          y1={M.top}
          y2={M.top + plotH}
          stroke="var(--fg-subtle)"
          strokeWidth="1"
          shapeRendering="crispEdges"
        />

        <text x={M.left} y={height - 6} className="fill-[var(--chart-axis)] text-[10px] tabular-nums">
          {formatPrice(lo)}
        </text>
        <text x={midX} y={height - 6} textAnchor="middle" className="fill-[var(--fg-muted)] text-[10px] tabular-nums">
          {formatPrice(mid)}
        </text>
        <text
          x={M.left + plotW}
          y={height - 6}
          textAnchor="end"
          className="fill-[var(--chart-axis)] text-[10px] tabular-nums"
        >
          {formatPrice(hi)}
        </text>
      </svg>
    </div>
  );
}
