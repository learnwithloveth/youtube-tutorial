'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import { linearScale, niceTicks, smoothPath } from './scale';
import { useChartSize } from './use-chart-size';
import { ChartTooltip } from './chart-frame';

export interface AreaPoint {
  t: number;
  v: number;
}

interface AreaChartProps {
  data: readonly AreaPoint[];
  color?: string;
  height?: number;
  formatValue: (v: number) => string;
  formatX: (t: number) => string;
  /** Rendered in the tooltip under the value. */
  label: string;
  ariaSummary: string;
}

const M = { top: 12, right: 16, bottom: 26, left: 60 };

/**
 * Single-series area chart with a snapping crosshair.
 *
 * The reader aims at a date, not at a 2px line: the pointer's x is mapped to the
 * nearest sample and the whole column highlights. Arrow keys do the same thing
 * from the keyboard, so focus and hover expose identical detail.
 */
export function AreaChart({
  data, color = 'var(--chart-1)', height = 260, formatValue, formatX, label, ariaSummary,
}: AreaChartProps) {
  const { ref, width } = useChartSize<HTMLDivElement>();
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const plotW = Math.max(80, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;

  const { x, y, ticks, line, area, points } = useMemo(() => {
    const values = data.map((d) => d.v);
    const { ticks: yTicks, domain } = niceTicks(Math.min(...values), Math.max(...values), 4);
    const xs = linearScale([0, Math.max(1, data.length - 1)], [M.left, M.left + plotW]);
    const ys = linearScale(domain, [M.top + plotH, M.top]);
    const pts = data.map((d, i) => [xs(i), ys(d.v)] as const);
    const path = smoothPath(pts);
    return {
      x: xs,
      y: ys,
      ticks: yTicks,
      points: pts,
      line: path,
      area: `${path} L ${M.left + plotW} ${M.top + plotH} L ${M.left} ${M.top + plotH} Z`,
    };
  }, [data, plotW, plotH]);

  const move = useCallback(
    (clientX: number, rect: DOMRect) => {
      const local = clientX - rect.left;
      const index = Math.round(x.invert(local));
      setActive(Math.min(data.length - 1, Math.max(0, index)));
    },
    [x, data.length],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setActive((current) => {
        const base = current ?? data.length - 1;
        const next = base + (event.key === 'ArrowRight' ? 1 : -1);
        return Math.min(data.length - 1, Math.max(0, next));
      });
    },
    [data.length],
  );

  const cursor = active === null ? null : data[active];
  const last = points[points.length - 1];

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaSummary}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
      >
        <defs>
          {/* A wash, never a saturated block. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Hairline, solid, one step off surface. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={M.left}
              x2={M.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--chart-grid)"
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

        {data.length > 1
          ? [0, Math.floor((data.length - 1) / 2), data.length - 1]
              .map((i, n) => ({ i, n, point: data[i] }))
              .filter((tick): tick is { i: number; n: number; point: AreaPoint } =>
                tick.point !== undefined,
              )
              .map(({ i, n, point }) => (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 8}
                  textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}
                  className="fill-[var(--chart-axis)] text-[11px]"
                >
                  {formatX(point.t)}
                </text>
              ))
          : null}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Endpoint marker: >=8px, with a 2px surface ring so it reads over the fill. */}
        {last ? (
          <circle
            cx={last[0]}
            cy={last[1]}
            r="4.5"
            fill={color}
            stroke="var(--chart-surface)"
            strokeWidth="2"
          />
        ) : null}

        {active !== null && points[active] ? (
          <g>
            <line
              x1={points[active][0]}
              x2={points[active][0]}
              y1={M.top}
              y2={M.top + plotH}
              stroke="var(--fg-subtle)"
              strokeWidth="1"
            />
            <circle
              cx={points[active][0]}
              cy={points[active][1]}
              r="5"
              fill={color}
              stroke="var(--chart-surface)"
              strokeWidth="2"
            />
          </g>
        ) : null}
      </svg>

      {cursor && active !== null && points[active] ? (
        <ChartTooltip x={points[active][0]} y={points[active][1]} width={width}>
          <p className="text-sm font-semibold tabular-nums text-fg">{formatValue(cursor.v)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color }} />
            {label}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">{formatX(cursor.t)}</p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
