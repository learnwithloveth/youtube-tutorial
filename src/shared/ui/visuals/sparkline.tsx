import { cn } from '@/shared/lib/cn';

interface SparklineProps {
  data: readonly number[];
  /**
   * Unique id for this instance's fill gradient.
   *
   * Explicit rather than generated: `useId` is a hook, and reaching for one here
   * would make every sparkline a Client Component — twenty-four of them on the
   * markets table alone. Callers already hold a natural key (the asset symbol),
   * so passing it keeps the component pure, server-rendered, and free of
   * duplicate DOM ids.
   */
  id: string;
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
 * Hand-rolled SVG sparkline. A charting library would cost roughly 90KB gzipped
 * to draw a polyline; this is a Catmull-Rom spline converted to cubic Béziers,
 * computed on the server, and shipped as static markup.
 */
export function Sparkline({
  data,
  id,
  color,
  positive = true,
  width = 120,
  height = 36,
  filled = true,
  className,
  strokeWidth = 1.75,
}: SparklineProps) {
  const stroke = color ?? (positive ? 'var(--up)' : 'var(--down)');
  const { line, area } = buildPaths(data, width, height, strokeWidth);

  if (!line) return null;

  const gradientId = `spark-${id}`;

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
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled ? <path d={area} fill={`url(#${gradientId})`} /> : null}
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

type Point = readonly [x: number, y: number];

function buildPaths(
  data: readonly number[],
  width: number,
  height: number,
  strokeWidth: number,
): { line: string; area: string } {
  if (data.length < 2) return { line: '', area: '' };

  const pad = strokeWidth;
  const stepX = (width - pad * 2) / (data.length - 1);
  const points: Point[] = data.map((value, index) => [
    pad + index * stepX,
    pad + (1 - value) * (height - pad * 2),
  ]);

  const first = points[0];
  if (!first) return { line: '', area: '' };

  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;

  // Catmull-Rom through every point, expressed as cubic Béziers. The control
  // points need the neighbours on either side, and at the ends the curve is
  // clamped by repeating the endpoint rather than extrapolating past it.
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) break;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }

  return { line: d, area: `${d} L ${width - pad} ${height} L ${pad} ${height} Z` };
}
