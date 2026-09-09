'use client';

import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/primitives/button';
import type { ButtonSize } from '@/shared/ui/primitives/button-styles';

/**
 * A submit button that knows whether its form is in flight.
 *
 * `useFormStatus` reads the state of the nearest enclosing form, which is why this
 * has to be a separate component from the form itself — the hook returns nothing
 * for the component that renders the `<form>`.
 *
 * Disabling while pending is not cosmetic: a double-submitted sign-up runs the
 * registration twice, and the second attempt fails on the unique index with an
 * "already registered" error for an account the user just created.
 */
export function SubmitButton({
  children,
  pendingLabel,
  size = 'lg',
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  size?: ButtonSize;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size={size} sheen className={className} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
