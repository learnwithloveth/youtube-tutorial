import { BRAND } from '@/modules/content';
import { cn } from '@/shared/lib/cn';

/**
 * The Novex mark: a prism whose inner stroke doubles as an ascending "N" and a
 * rising chart line.
 *
 * The original scoped its gradient ids with `useId`, which made the logo a
 * Client Component — an expensive way to pay for two `<linearGradient>` elements
 * on a mark that appears in the header and footer of every page. `useId` is not
 * available in Server Components, and the underlying problem it solved (two
 * instances on a page emitting duplicate ids) has a better answer: the gradients
 * are identical everywhere, so they are defined exactly once as a document-level
 * sprite and every mark references them by a stable id.
 *
 * `<LogoGradients />` is rendered once in the root layout. Both components are
 * Server Components and ship no JavaScript.
 */

const GRADIENT_PRISM = 'novex-logo-prism';
const GRADIENT_STROKE = 'novex-logo-stroke';

/** The shared gradient definitions. Rendered once, in the root layout. */
export function LogoGradients() {
  return (
    <svg aria-hidden focusable="false" width="0" height="0" className="absolute">
      <defs>
        <linearGradient id={GRADIENT_PRISM} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="52%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id={GRADIENT_STROKE} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn('size-9', className)}
      role="img"
      aria-label={BRAND.name}
    >
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="12" fill={`url(#${GRADIENT_PRISM})`} />
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="12"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.22"
        strokeWidth="1.5"
      />
      <path
        d="M11.5 28.5V12.2c0-.7.85-1.05 1.34-.55L26.9 26.1c.5.5 1.35.15 1.35-.55V11.5"
        fill="none"
        stroke={`url(#${GRADIENT_STROKE})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28.25" cy="11.5" r="2.6" fill="#ffffff" />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-[1.15rem] font-bold tracking-[-0.04em] text-fg">
        {BRAND.wordmark}
      </span>
    </span>
  );
}
