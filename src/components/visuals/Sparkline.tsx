import { useId, useMemo } from 'react';
import { cn } from '@/lib/cn';

interface SparklineProps {
  data: readonly number[];
  /** Stroke colour; defaults to the up/down semantic token via `positive`. */
  color?: string;
  positive?: boolean;
  width?: number;
  height?: number;
  filled?: boolean;
  className?: string;
  strokeWidth?: number;
}

/**
 * Hand-rolled SVG sparkline — a charting library would cost ~90KB gzipped for
 * a polyline. Uses a Catmull-Rom → cubic Bézier conversion for smooth curves.
 */
export function Sparkline({
  data,
  color,
  positive = true,
  width = 120,
  height = 36,
  filled = true,
  className,
  strokeWidth = 1.75,
}: SparklineProps) {
  const id = useId();
  const stroke = color ?? (positive ? 'var(--up)' : 'var(--down)');

  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };
    const pad = strokeWidth;
    const stepX = (width - pad * 2) / (data.length - 1);
    const points = data.map((v, i) => [pad + i * stepX, pad + (1 - v) * (height - pad * 2)] as const);

    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return { line: d, area: `${d} L ${width - pad} ${height} L ${pad} ${height} Z` };
  }, [data, width, height, strokeWidth]);

  if (!line) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      aria-hidden
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled ? <path d={area} fill={`url(#${id}-fill)`} /> : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
