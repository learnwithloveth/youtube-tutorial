import { cn } from '@/shared/lib/cn';

/**
 * The shapes a page shows while its data is in flight.
 *
 * ── Why this exists at all ────────────────────────────────────────────────────
 * Every dashboard route reads a balance, a quote or a queue, so every one of them
 * is `force-dynamic` — and without a `loading` boundary a navigation renders
 * *nothing* until the last database round trip lands. That is not a spinner
 * problem: the previous page stays on screen, frozen, and the application reads as
 * broken rather than as busy.
 *
 * It also has a second job that is easy to miss. Next only prefetches a dynamic
 * route as far as its nearest `loading` boundary — with no boundary, hovering a
 * link prefetches nothing at all. These components are what make the router's
 * prefetch do any work.
 *
 * ── The sizes are not decoration ──────────────────────────────────────────────
 * Each block matches the real element it stands in for: the same height, the same
 * gap, the same grid. A skeleton that is the wrong size is worse than none,
 * because the page jumps when the data arrives and the reader loses their place —
 * the layout shift is the thing this is supposed to prevent.
 *
 * ── No animation for anybody who asked for none ───────────────────────────────
 * `motion-reduce:animate-none` rather than a hook: the base layer already honours
 * `prefers-reduced-motion`, and a pulsing page is exactly the kind of thing that
 * setting exists to stop.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md bg-surface-strong motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/**
 * The heading block, matching `PageHeader`'s own spacing.
 *
 * `role="status"` with the visually-hidden line is the whole accessibility story
 * here: a screen reader announces "Loading" once, rather than reading out a dozen
 * empty boxes or — with no boundary at all — saying nothing while the page hangs.
 */
export function PageSkeleton({
  tiles = 3,
  panels = 1,
  children,
}: {
  /** Stat tiles across the top. Zero for pages that have none. */
  tiles?: number;
  /** Full-width panels below them. */
  panels?: number;
  children?: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading</span>

      {/* Matches PageHeader: mb-6, a 2xl title and a single description line. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2.5 h-4 w-72 max-w-full" />
        </div>
      </div>

      {tiles > 0 ? (
        <div
          className={cn(
            'mb-4 grid gap-4',
            tiles === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          {Array.from({ length: tiles }, (_, index) => (
            <Skeleton key={index} className="h-[6.5rem]" />
          ))}
        </div>
      ) : null}

      {children ?? (
        <div className="grid gap-4">
          {Array.from({ length: panels }, (_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      )}
    </div>
  );
}

/** A panel whose body is a list of rows — a table, a feed, a queue. */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-line bg-bg-elev p-5', className)}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-3.5 w-56" />
      <div className="mt-5 grid gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-9" />
        ))}
      </div>
    </div>
  );
}
