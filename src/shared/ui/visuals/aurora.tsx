import { cn } from '@/shared/lib/cn';

/**
 * The signature background: three blurred haloes drifting over a grain layer,
 * clipped to the section. Purely decorative — never announced to assistive
 * technology — and entirely CSS, so it ships no JavaScript.
 */
export function Aurora({ className, grid = false }: { className?: string; grid?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden grain',
        className,
      )}
    >
      <div className="aurora-field">
        <i />
      </div>
      {grid ? <div className="absolute inset-0 grid-lines opacity-60" /> : null}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}

/** A single soft glow, used to light a specific corner of a section. */
export function Glow({
  className,
  color = 'var(--brand)',
  size = 520,
  opacity = 0.4,
}: {
  className?: string;
  color?: string;
  size?: number;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute -z-10 rounded-full blur-3xl', className)}
      style={{
        width: size,
        height: size,
        opacity,
        background: `radial-gradient(circle at 50% 50%, ${color}, transparent 68%)`,
      }}
    />
  );
}
