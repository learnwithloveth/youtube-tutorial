'use client';

import { useCallback, useMemo, useState } from 'react';
import { linearScale, niceTicks } from './scale';
import { useChartSize } from './use-chart-size';
import { ChartTooltip } from './chart-frame';
import type { Candle } from './types';

const M = { top: 12, right: 74, bottom: 26, left: 12 };
const VOLUME_H = 56;
const PANEL_GAP = 10;

/**
 * Price and volume as two stacked panels on one shared x-axis.
 *
 * Deliberately not a dual-axis chart: price and volume have unrelated scales, so
 * they get their own plots rather than two y-scales overlaid on one — the single
 * most common way a finance chart misleads.
 */
export function CandleChart({
  candles, height = 320, formatPrice, formatAxis, formatX, formatVolume,
}: {
  candles: readonly Candle[];
  height?: number;
  formatPrice: (v: number) => string;
  /** Tick labels; defaults to formatPrice. Compact keeps the gutter narrow. */
  formatAxis?: (v: number) => string;
  formatX: (t: number) => string;
  formatVolume: (v: number) => string;
}) {
  const { ref, width } = useChartSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotW = Math.max(80, width - M.left - M.right);
  const priceH = height - M.top - M.bottom - VOLUME_H - PANEL_GAP;
  const volTop = M.top + priceH + PANEL_GAP;

  const { x, y, vy, ticks, slot, body } = useMemo(() => {
    const lows = candles.map((c) => c.l);
    const highs = candles.map((c) => c.h);
    const { ticks: t, domain } = niceTicks(Math.min(...lows), Math.max(...highs), 4);
    const xs = linearScale([0, Math.max(1, candles.length)], [M.left, M.left + plotW]);
    const ys = linearScale(domain, [M.top + priceH, M.top]);
    const maxV = Math.max(...candles.map((c) => c.v));
    const vys = linearScale([0, maxV], [volTop + VOLUME_H, volTop]);
    const s = plotW / Math.max(1, candles.length);
    return { x: xs, y: ys, vy: vys, ticks: t, slot: s, body: Math.max(1.5, Math.min(9, s * 0.62)) };
  }, [candles, plotW, priceH, volTop]);

  const move = useCallback(
    (clientX: number, rect: DOMRect) => {
      const i = Math.floor((clientX - rect.left - M.left) / slot);
      setActive(i >= 0 && i < candles.length ? i : null);
    },
    [slot, candles.length],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setActive((cur) => {
        const base = cur ?? candles.length - 1;
        return Math.min(candles.length - 1, Math.max(0, base + (event.key === 'ArrowRight' ? 1 : -1)));
      });
    },
    [candles.length],
  );

  const hovered = active === null ? null : candles[active];

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Daily candles over ${candles.length} sessions with a volume panel below.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
      >
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
              x={M.left + plotW + 8}
              y={y(tick)}
              dominantBaseline="middle"
              className="fill-[var(--chart-axis)] text-[11px] tabular-nums"
            >
              {(formatAxis ?? formatPrice)(tick)}
            </text>
          </g>
        ))}

        {candles.map((candle, i) => {
          const cx = x(i) + slot / 2;
          const up = candle.c >= candle.o;
          const color = up ? 'var(--up)' : 'var(--down)';
          const yHigh = y(candle.h);
          const yLow = y(candle.l);
          const yOpen = y(candle.o);
          const yClose = y(candle.c);
          const top = Math.min(yOpen, yClose);
          const h = Math.max(1, Math.abs(yClose - yOpen));
          const dim = active !== null && active !== i;
          return (
            <g key={candle.t} opacity={dim ? 0.42 : 1} className="transition-opacity duration-150">
              <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1" />
              <rect x={cx - body / 2} y={top} width={body} height={h} fill={color} rx="0.5" />
              <rect
                x={cx - body / 2}
                y={vy(candle.v)}
                width={body}
                height={Math.max(1, volTop + VOLUME_H - vy(candle.v))}
                fill={color}
                opacity="0.5"
              />
            </g>
          );
        })}

        <line
          x1={M.left}
          x2={M.left + plotW}
          y1={volTop + VOLUME_H}
          y2={volTop + VOLUME_H}
          stroke="var(--chart-grid)"
          strokeWidth="1"
          shapeRendering="crispEdges"
        />
        <text x={M.left} y={volTop - 2} className="fill-[var(--chart-axis)] text-[10px] uppercase tracking-wider">
          Volume
        </text>

        {[0, Math.floor(candles.length / 2), candles.length - 1].map((i, n) =>
          candles[i] ? (
            <text
              key={i}
              x={x(i) + slot / 2}
              y={height - 8}
              textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}
              className="fill-[var(--chart-axis)] text-[11px]"
            >
              {formatX(candles[i].t)}
            </text>
          ) : null,
        )}

        {active !== null && candles[active] ? (
          <line
            x1={x(active) + slot / 2}
            x2={x(active) + slot / 2}
            y1={M.top}
            y2={volTop + VOLUME_H}
            stroke="var(--fg-subtle)"
            strokeWidth="1"
          />
        ) : null}
      </svg>

      {hovered && active !== null ? (
        <ChartTooltip x={x(active)} y={M.top} width={width}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {([['Open', hovered.o], ['High', hovered.h], ['Low', hovered.l], ['Close', hovered.c]] as const).map(
              ([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-subtle">{k}</dt>
                  <dd className="text-right font-medium tabular-nums text-fg">{formatPrice(v)}</dd>
                </div>
              ),
            )}
            <dt className="text-fg-subtle">Volume</dt>
            <dd className="text-right font-medium tabular-nums text-fg">{formatVolume(hovered.v)}</dd>
          </dl>
          <p className="mt-2 border-t border-line pt-1.5 text-xs text-fg-subtle">{formatX(hovered.t)}</p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}
