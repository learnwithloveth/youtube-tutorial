import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Horizontal overflow is the table's own problem, never the page body's.
 *
 * ── `relative` is load-bearing ────────────────────────────────────────────────
 * The caption is `sr-only`, and `sr-only` is `position: absolute`. An absolutely
 * positioned element is clipped by a scroll container only when that container is
 * its containing block — and a `static` wrapper is not one. So the caption escaped
 * this box and was positioned against something further up the page, which on a
 * phone widened the whole admin users page by four hundred pixels of empty space.
 * Making the scroller `relative` keeps everything inside the table inside the box
 * that scrolls it.
 */
export function TableShell({
  children, caption, className, minWidth = '44rem',
}: {
  children: ReactNode;
  caption: string;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className={cn('relative -mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5', className)}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children, numeric, className, ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-line px-3 py-3 text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children, numeric, className, ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'border-b border-line/60 px-3 py-3 text-fg-muted',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn('transition-colors duration-200 hover:bg-surface', className)}>{children}</tr>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-14 text-center text-sm text-fg-subtle">
        {children}
      </td>
    </tr>
  );
}
