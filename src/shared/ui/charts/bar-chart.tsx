'use client';

import { useMemo, useState } from 'react';
import { linearScale, niceTicks } from './scale';
import { useChartSize } from './use-chart-size';
import { ChartTooltip } from './chart-frame';

export interface Bar {
  label: string;
  value: number;
}

const M = { top: 14, right: 12, bottom: 28, left: 62 };
const MAX_BAR = 24;

/** Rounded at the data end, square at the baseline, in either direction. */
function barPath(x: number, w: number, yValue: number, yZero: number, r = 4): string {
  const up = yValue <= yZero;
  const h = Math.abs(yZero - yValue);
  const radius = Math.min(r, h, w / 2);
  return up
    ? `M ${x} ${yZero} L ${x} ${yValue + radius} Q ${x} ${yValue} ${x + radius} ${yValue} L ${x + w - radius} ${yValue} Q ${x + w} ${yValue} ${x + w} ${yValue + radius} L ${x + w} ${yZero} Z`
    : `M ${x} ${yZero} L ${x} ${yValue - radius} Q ${x} ${yValue} ${x + radius} ${yValue} L ${x + w - radius} ${yValue} Q ${x + w} ${yValue} ${x + w} ${yValue - radius} L ${x + w} ${yZero} Z`;
}

/**
 * Diverging columns around a zero baseline.
 *
 * Polarity is carried three ways — side of the baseline, the reserved up/down
 * status hues, and the sign in the label — so it survives colour-blindness and
 * grayscale print.
 */
export function BarChart({
  bars, height = 240, formatValue, ariaSummary,
}: {
  bars: readonly Bar[];
  height?: number;
  formatValue: (v: number) => string;
  ariaSummary: string;
}) {
  const { ref, width } = useChartSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(80, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;

  const { y, ticks, band, barW, zero } = useMemo(() => {
    const values = bars.map((b) => b.value);
    const { ticks: t, domain } = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
    const ys = linearScale(domain, [M.top + plotH, M.top]);
    const slot = plotW / Math.max(1, bars.length);
    return { y: ys, ticks: t, band: slot, barW: Math.min(MAX_BAR, slot * 0.55), zero: ys(0) };
  }, [bars, plotW, plotH]);

  // Label only the extremes; a number on every column goes unread.
  const extremes = useMemo(() => {
    if (bars.length === 0) return new Set<number>();
    let hi = 0;
    let lo = 0;
    let highest = Number.NEGATIVE_INFINITY;
    let lowest = Number.POSITIVE_INFINITY;
    bars.forEach((bar, index) => {
      if (bar.value > highest) {
        highest = bar.value;
        hi = index;
      }
      if (bar.value < lowest) {
        lowest = bar.value;
        lo = index;
      }
    });
    return new Set([hi, lo]);
  }, [bars]);

  // Hoisted so the hovered element is narrowed once rather than re-indexed
  // in five places the compiler cannot prove are in range.
  const hoveredBar = hover === null ? null : bars[hover];

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={ariaSummary}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={M.left}
              x2={M.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? 'var(--line-strong)' : 'var(--chart-grid)'}
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <text
              x={M.left - 10}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[var(--chart-axis)] text-[11px] tabular-nums"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {bars.map((bar, i) => {
          const x = M.left + i * band + (band - barW) / 2;
          const up = bar.value >= 0;
          const color = up ? 'var(--up)' : 'var(--down)';
          const yv = y(bar.value);
          return (
            <g key={bar.label}>
              {/* Hit target spans the whole band, well past the 24px mark. */}
              <rect
                x={M.left + i * band}
                y={M.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${bar.label}: ${formatValue(bar.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-pointer outline-none"
              />
              <path
                d={barPath(x, barW, yv, zero)}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
                className="pointer-events-none transition-opacity duration-200"
              />
              {extremes.has(i) ? (
                <text
                  x={x + barW / 2}
                  y={up ? yv - 7 : yv + 14}
                  textAnchor="middle"
                  className="pointer-events-none fill-[var(--fg-muted)] text-[10px] font-medium tabular-nums"
                >
                  {formatValue(bar.value)}
                </text>
              ) : null}
              <text
                x={x + barW / 2}
                y={height - 9}
                textAnchor="middle"
                className="pointer-events-none fill-[var(--chart-axis)] text-[11px]"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredBar ? (
        <ChartTooltip
          x={M.left + (hover ?? 0) * band + band / 2}
          y={Math.min(y(hoveredBar.value), zero)}
          width={width}
        >
          <p className="text-sm font-semibold tabular-nums text-fg">
            {formatValue(hoveredBar.value)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
            <span
              aria-hidden
              className="size-2 rounded-xs"
              style={{ background: hoveredBar.value >= 0 ? 'var(--up)' : 'var(--down)' }}
            />
            {hoveredBar.label} · realised
          </p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
