'use client';

import { useEffect } from 'react';

import { Button } from '@/shared/ui/primitives/button';
import { ButtonLink } from '@/shared/ui/primitives/button-link';

/**
 * Route-level error boundary.
 *
 * Replaces the SPA's class `ErrorBoundary`. The framework catches the error and
 * renders this in place of the failed segment, so the navbar and footer survive
 * and the visitor keeps a way out — which a top-level boundary wrapping the
 * whole application could not offer.
 *
 * `reset` re-renders the segment. That is the right first action for a
 * transient failure (a query that timed out) and costs nothing when it is not.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production the server has already logged this with a stack; the digest
    // is the correlation id that ties what the visitor saw to that log line.
    console.error('[novex] route error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <p className="eyebrow mb-4 justify-center">Something broke</p>
        <h1 className="text-3xl font-semibold">We hit an unexpected error</h1>
        <p className="mt-4 text-fg-muted">
          The issue has been logged. Trying again usually clears it.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
            Reference {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="outline">
            Back to home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
