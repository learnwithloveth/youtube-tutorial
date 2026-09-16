import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';

export function AuthHeading({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}

export function AuthFooterLink({
  prompt,
  label,
  href,
}: {
  prompt: string;
  label: string;
  href: string;
}) {
  return (
    <p className="mt-8 text-center text-sm text-fg-muted">
      {prompt}{' '}
      <Link href={href} className="font-medium text-brand-soft underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  );
}

const GOOGLE_GLYPH =
  'M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.98 14.53 3 12 3 6.98 3 2.9 7.03 2.9 12s4.08 9 9.1 9c5.25 0 8.73-3.69 8.73-8.89 0-.6-.06-1.05-.15-1.5z';

/**
 * Sign in with Google — a real one.
 *
 * ── An anchor, not a button, and not `next/link` ──────────────────────────────
 * It leaves the application: the href is a route handler whose entire job is to
 * redirect to Google with a state cookie attached. A `next/link` would attempt a
 * client-side navigation to an API route, and a `<button>` would need JavaScript to
 * do what an ordinary link already does.
 *
 * ── Apple is gone, and Google disappears when unconfigured ────────────────────
 * Both buttons used to be here with no handler at all, so clicking either did
 * nothing. Google now works; Apple is removed rather than left as a control that
 * looks real and is not — the same reason the API keys tab and the liveness step
 * went. When no Google credentials are configured this renders nothing, so a
 * deployment without them shows a password form and no dead alternative.
 */
export function SocialAuth({
  verb = 'Continue',
  enabled,
  next,
}: {
  verb?: string;
  enabled: boolean;
  /** Same-site path to land on afterwards; the route validates it again. */
  next?: string | undefined;
}) {
  if (!enabled) return null;

  const href = next
    ? `/api/auth/google/start?next=${encodeURIComponent(next)}`
    : '/api/auth/google/start';

  return (
    <>
      <a
        href={href}
        className={cn(
          'flex h-12 items-center justify-center gap-2.5 rounded-md border border-line bg-surface',
          'text-sm font-medium text-fg backdrop-blur-md transition-all duration-300',
          'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-hover',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
          <path d={GOOGLE_GLYPH} />
        </svg>
        {verb} with Google
      </a>
      <div className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-2xs uppercase tracking-[0.18em] text-fg-subtle">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

/** Four-band strength meter driven by length, class variety and repetition. */
export function PasswordStrength({ value }: { value: string }) {
  const checks = [
    value.length >= 12,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  const tones = ['bg-line', 'bg-down', 'bg-warn', 'bg-accent', 'bg-up'];

  return (
    <div className="mt-3" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-500',
              i < score ? tones[score] : 'bg-line',
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        {value ? labels[score] : 'Use 12+ characters with a mix of cases, digits and symbols.'}
      </p>
    </div>
  );
}
