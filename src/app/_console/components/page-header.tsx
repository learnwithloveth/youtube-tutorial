import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function PageHeader({
  title, description, actions, className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The dashboard's card. Flatter than the marketing Card — no spotlight, no glow. */
export function Panel({
  children, className, padded = true, id,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /**
   * An anchor for one item in a queue.
   *
   * A notification about a specific withdrawal or deposit links to
   * `/admin/approvals#withdrawal-<id>`, and the browser scrolls it into view. The
   * `scroll-mt` below is what stops the sticky top bar covering the row it just
   * jumped to.
   */
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'min-w-0 rounded-lg border border-line bg-bg-elev/70 backdrop-blur-xl',
        padded && 'p-5',
        id !== undefined && 'scroll-mt-24 target:border-brand-soft',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title, subtitle, actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-fg-subtle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
