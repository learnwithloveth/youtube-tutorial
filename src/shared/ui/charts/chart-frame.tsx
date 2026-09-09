'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Table2, ChartSpline } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export interface LegendItem {
  label: string;
  color: string;
  /** Bars and areas key with a swatch; lines key with a stroke. */
  shape?: 'rect' | 'line';
}

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
  /** Columns rendered right-aligned with tabular figures. */
  numericFrom?: number;
}

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  legend?: LegendItem[];
  table: TableView;
  children: ReactNode;
  className?: string;
  /** Suppresses the frame's own card chrome when nested in a larger card. */
  bare?: boolean;
}

/**
 * The shell every chart sits in.
 *
 * It owns the two things a chart must never be shipped without: an always-present
 * legend once there are two or more series, and a table view carrying every value
 * the marks encode — so nothing is gated behind a hover.
 */
export function ChartFrame({
  title, subtitle, actions, legend, table, children, className, bare,
}: ChartFrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const id = useId();

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'min-w-0',
        !bare && 'rounded-lg border border-line bg-bg-elev/70 p-5 backdrop-blur-xl',
        className,
      )}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-base font-semibold text-fg">
            {title}
          </h3>
          {subtitle ? <p className="mt-1 text-xs text-fg-subtle">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            aria-pressed={view === 'table'}
            title={view === 'chart' ? 'Show data table' : 'Show chart'}
            className="grid size-8 place-items-center rounded-sm border border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
          >
            {view === 'chart' ? <Table2 className="size-4" /> : <ChartSpline className="size-4" />}
            <span className="sr-only">
              {view === 'chart' ? 'Show data table' : 'Show chart'}
            </span>
          </button>
        </div>
      </header>

      {view === 'chart' ? (
        <>
          {children}
          {legend && legend.length >= 2 ? (
            <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              {legend.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs text-fg-muted">
                  {item.shape === 'line' ? (
                    <span
                      aria-hidden
                      className="h-0.5 w-4 rounded-full"
                      style={{ background: item.color }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="size-2.5 rounded-xs"
                      style={{ background: item.color }}
                    />
                  )}
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{title} — data table</caption>
            <thead className="sticky top-0 bg-bg-elev">
              <tr>
                {table.columns.map((col, i) => (
                  <th
                    key={col}
                    scope="col"
                    className={cn(
                      'border-b border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle',
                      table.numericFrom !== undefined && i >= table.numericFrom
                        ? 'text-right'
                        : 'text-left',
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-line/60 last:border-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={cn(
                        'px-3 py-2 text-fg-muted',
                        table.numericFrom !== undefined && c >= table.numericFrom
                          ? 'text-right tabular-nums'
                          : 'text-left',
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Shared tooltip shell — values lead, series names follow. */
export function ChartTooltip({
  x, y, width, children,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
}) {
  // Flip to the other side of the cursor near the right edge so the readout
  // never leaves the plot.
  const flip = x > width - 150;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-36 rounded-md border border-line bg-bg-elev/97 px-3 py-2.5 shadow-float backdrop-blur-xl"
      style={{
        left: flip ? undefined : x + 14,
        right: flip ? width - x + 14 : undefined,
        top: Math.max(4, y - 12),
      }}
    >
      {children}
    </div>
  );
}
