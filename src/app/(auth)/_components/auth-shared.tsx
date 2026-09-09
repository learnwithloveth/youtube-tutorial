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
  to,
}: {
  prompt: string;
  label: string;
  to: string;
}) {
  return (
    <p className="mt-8 text-center text-sm text-fg-muted">
      {prompt}{' '}
      <Link href={to} className="font-medium text-brand-soft underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  );
}

const PROVIDERS = [
  {
    name: 'Google',
    path: 'M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.98 14.53 3 12 3 6.98 3 2.9 7.03 2.9 12s4.08 9 9.1 9c5.25 0 8.73-3.69 8.73-8.89 0-.6-.06-1.05-.15-1.5z',
  },
  {
    name: 'Apple',
    path: 'M17.05 12.53c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.07 2.66-2.14.84-1.23 1.19-2.42 1.2-2.48-.02-.01-2.3-.88-2.3-3.51zM14.86 5.8c.6-.74 1.01-1.75.9-2.77-.87.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.59-1.25z',
  },
];

export function SocialAuth({ verb = 'Continue' }: { verb?: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.name}
            type="button"
            className={cn(
              'flex h-12 items-center justify-center gap-2.5 rounded-md border border-line bg-surface',
              'text-sm font-medium text-fg backdrop-blur-md transition-all duration-300',
              'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-hover',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
              <path d={provider.path} />
            </svg>
            {verb} with {provider.name}
          </button>
        ))}
      </div>
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
