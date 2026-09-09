'use client';

import { useState } from 'react';
import { arcPath, categorical } from './scale';
import { ChartTooltip } from './chart-frame';
import { cn } from '@/shared/lib/cn';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  share: number;
}

/**
 * Part-to-whole at a glance. Segments are capped at six by folding the tail into
 * an "Other" slot upstream — past that, adjacent slices stop being separable and
 * a table is the honest form.
 */
export function DonutChart({
  slices, size = 200, formatValue, centerLabel, centerValue,
}: {
  slices: readonly DonutSlice[];
  size?: number;
  formatValue: (v: number) => string;
  centerLabel: string;
  centerValue: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.63;

  // A 2px gap in the surface colour separates touching fills; expressed in
  // degrees so it stays 2px of arc whatever the radius.
  const gapDeg = (2 / (2 * Math.PI * rOuter)) * 360;
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;

  // Cumulative start angles, built with a plain loop.
  //
  // The obvious `let cursor = 0` mutated inside `.map()` is what React 19's
  // immutability rule rejects: a variable reassigned from inside a render-phase
  // callback produces different results if that callback is ever re-entered,
  // which the compiler is free to do. A loop that only fills a local array has
  // no such hazard.
  const offsets: number[] = [];
  for (let i = 0, running = 0; i < slices.length; i += 1) {
    offsets.push(running);
    running += ((slices[i]?.value ?? 0) / total) * 360;
  }

  const arcs = slices.map((slice, i) => {
    const sweep = (slice.value / total) * 360;
    const base = offsets[i] ?? 0;
    const start = base + gapDeg / 2;
    const end = base + sweep - gapDeg / 2;
    return {
      slice,
      color: slice.key === 'Other' ? 'var(--fg-subtle)' : categorical(i),
      d: arcPath(cx, cy, rOuter, rInner, start, Math.max(start + 0.4, end)),
    };
  });

  const hoveredSlice = hover === null ? null : slices[hover];
  const hoveredArc = hover === null ? null : arcs[hover];

  return (
    <div className="flex flex-wrap items-center justify-center gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          {arcs.map((arc, i) => (
            <path
              key={arc.slice.key}
              d={arc.d}
              fill={arc.color}
              tabIndex={0}
              role="button"
              aria-label={`${arc.slice.label}: ${formatValue(arc.slice.value)}, ${arc.slice.share.toFixed(1)} percent`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={cn(
                'origin-center cursor-pointer outline-none transition-opacity duration-200',
                hover !== null && hover !== i && 'opacity-45',
              )}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="text-2xs uppercase tracking-wider text-fg-subtle">{centerLabel}</p>
          <p className="mt-1 text-lg font-semibold text-fg">{centerValue}</p>
        </div>
        {hoveredSlice ? (
          <ChartTooltip x={size / 2} y={16} width={size}>
            <p className="text-sm font-semibold tabular-nums text-fg">
              {formatValue(hoveredSlice.value)}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
              <span
                aria-hidden
                className="size-2 rounded-xs"
                style={{ background: hoveredArc?.color }}
              />
              {hoveredSlice.label}
            </p>
          </ChartTooltip>
        ) : null}
      </div>

      {/* Direct labels: identity never rests on colour alone. */}
      <ul className="min-w-44 flex-1 space-y-2.5">
        {arcs.map((arc, i) => (
          <li
            key={arc.slice.key}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className={cn(
              'flex items-center gap-3 rounded-sm px-1 py-0.5 transition-opacity',
              hover !== null && hover !== i && 'opacity-45',
            )}
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: arc.color }} />
            <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{arc.slice.label}</span>
            <span className="text-sm font-medium tabular-nums text-fg">
              {arc.slice.share.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
