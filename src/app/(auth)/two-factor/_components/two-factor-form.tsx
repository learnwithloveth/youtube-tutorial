'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/shared/ui/primitives/button';
import { AuthFooterLink, AuthHeading } from '../../_components/auth-shared';
import { cn } from '@/shared/lib/cn';

const LENGTH = 6;

export function TwoFactorForm() {

  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const complete = digits.every(Boolean);

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = clean;
      return next;
    });
    if (clean && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  /** Pasting the whole code should fill every box, not just the first. */
  const onPaste = (event: React.ClipboardEvent) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(LENGTH).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setDigits(next);
    inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  };

  return (
    <div>
      <span className="mb-7 grid size-14 place-items-center rounded-full border border-line bg-surface text-brand-soft">
        <ShieldCheck className="size-6" />
      </span>

      <AuthHeading
        title="Two-factor verification"
        body="Enter the six-digit code from your authenticator app. It rotates every thirty seconds."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push('/');
        }}
      >
        <fieldset>
          <legend className="sr-only">Six-digit verification code</legend>
          <div className="flex justify-between gap-2" onPaste={onPaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputs.current[index] = el;
                }}
                value={digit}
                onChange={(e) => setDigit(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(index, e)}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                aria-label={`Digit ${index + 1}`}
                className={cn(
                  'h-16 w-full rounded-md border bg-bg-elev/60 text-center font-display text-2xl font-semibold text-fg',
                  'outline-none backdrop-blur-md transition-all duration-300',
                  digit ? 'border-brand-soft' : 'border-line hover:border-line-strong',
                  'focus:border-brand-soft focus:ring-4 focus:ring-[color-mix(in_oklab,var(--brand)_22%,transparent)]',
                )}
              />
            ))}
          </div>
        </fieldset>

        <Button type="submit" size="lg" sheen className="mt-7 w-full" disabled={!complete}>
          Verify and continue
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>

      <button
        type="button"
        className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <Smartphone className="size-4" />
        Send a code to my phone instead
      </button>

      <AuthFooterLink prompt="Lost your device?" label="Recover your account" to="/contact" />
    </div>
  );
}
