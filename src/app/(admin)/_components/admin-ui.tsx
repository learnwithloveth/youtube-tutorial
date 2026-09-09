import type { ReactNode } from 'react';
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Badge } from '@/shared/ui/primitives/badge';
import type { Risk } from '../_data/types';
import { cn } from '@/shared/lib/cn';

export function AdminPageHeader({
  title, description, actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Risk is never colour alone: each level ships an icon and the word, so it
 * survives colour-blindness, greyscale print and a glance across the room.
 */
const RISK_META: Record<Risk, { tone: 'up' | 'warn' | 'down' | 'neutral'; Icon: typeof ShieldCheck; label: string }> = {
  low: { tone: 'up', Icon: ShieldCheck, label: 'Low' },
  medium: { tone: 'neutral', Icon: ShieldQuestion, label: 'Medium' },
  high: { tone: 'warn', Icon: AlertTriangle, label: 'High' },
  critical: { tone: 'down', Icon: ShieldAlert, label: 'Critical' },
};

export function RiskBadge({ risk, score }: { risk: Risk; score?: number }) {
  const meta = RISK_META[risk];
  return (
    <Badge tone={meta.tone}>
      <meta.Icon className="size-3" />
      {meta.label}
      {score !== undefined ? <span className="tabular-nums opacity-80">{score}</span> : null}
    </Badge>
  );
}

/** A destructive action always states what it will do before it does it. */
export function DangerButton({
  children, onClick, className, disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-down/40 bg-down/10 px-3 py-1.5',
        'text-xs font-medium text-down transition-colors hover:border-down/70 hover:bg-down/18',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ConfirmButton({
  children, onClick, className, disabled, tone = 'up',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  tone?: 'up' | 'brand';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
        tone === 'up'
          ? 'border-up/40 bg-up/10 text-up hover:border-up/70 hover:bg-up/18'
          : 'border-brand-soft/40 bg-brand/12 text-brand-soft hover:border-brand-soft/70 hover:bg-brand/20',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function QuietButton({
  children, onClick, className, disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-fg-muted',
        'transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <ShieldCheck className="size-7 text-up" />
      <p className="mt-4 text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-subtle">{body}</p>
    </div>
  );
}
