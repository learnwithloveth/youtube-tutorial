'use client';

import { useMemo, useState } from 'react';
import { ChartTooltip } from './chart-frame';

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

/**
 * Trading activity, one cell per day.
 *
 * The sequential ramp is mixed *towards the chart surface* rather than towards
 * white, so the quiet end recedes in both themes — the "flip the anchor in dark
 * mode" rule, handled by construction instead of by a second palette.
 */
export function Heatmap({
  data, formatDate, cell = 13, gap = 3,
}: {
  data: readonly { t: number; count: number }[];
  formatDate: (t: number) => string;
  cell?: number;
  gap?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { weeks, max, buckets } = useMemo(() => {
    const m = Math.max(1, ...data.map((d) => d.count));
    const cols = Math.ceil(data.length / 7);
    return {
      weeks: cols,
      max: m,
      buckets: [0.16, 0.36, 0.58, 0.8, 1],
    };
  }, [data]);

  const fillFor = (count: number) => {
    if (count === 0) return 'var(--chart-grid)';
    const ratio = count / max;
    const step = buckets.find((b) => ratio <= b) ?? 1;
    return `color-mix(in oklab, var(--chart-1) ${Math.round(step * 100)}%, var(--chart-surface))`;
  };

  const width = weeks * (cell + gap) + 30;
  const height = 7 * (cell + gap) + 18;

  const hoveredCell = hover === null ? null : data[hover];

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label={`Daily trade count over ${data.length} days.`}>
        {DAY_LABELS.map((label, row) =>
          label ? (
            <text
              key={row}
              x={0}
              y={row * (cell + gap) + cell - 2}
              className="fill-[var(--chart-axis)] text-[9px]"
            >
              {label}
            </text>
          ) : null,
        )}
        {data.map((day, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          return (
            <rect
              key={day.t}
              x={30 + col * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx="3"
              fill={fillFor(day.count)}
              tabIndex={0}
              role="button"
              aria-label={`${formatDate(day.t)}: ${day.count} trades`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-pointer outline-none transition-opacity hover:opacity-80"
            />
          );
        })}
      </svg>

      <div className="mt-3 flex items-center gap-2 text-2xs text-fg-subtle">
        <span>Fewer</span>
        {[0, ...buckets].map((step) => (
          <span
            key={step}
            aria-hidden
            className="size-3 rounded-xs"
            style={{
              background:
                step === 0
                  ? 'var(--chart-grid)'
                  : `color-mix(in oklab, var(--chart-1) ${Math.round(step * 100)}%, var(--chart-surface))`,
            }}
          />
        ))}
        <span>More</span>
      </div>

      {hover !== null ? (
        <ChartTooltip
          x={30 + Math.floor(hover / 7) * (cell + gap)}
          y={(hover % 7) * (cell + gap)}
          width={width}
        >
          <p className="text-sm font-semibold tabular-nums text-fg">
            {hoveredCell?.count} {hoveredCell?.count === 1 ? 'trade' : 'trades'}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {hoveredCell ? formatDate(hoveredCell.t) : ''}
          </p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
