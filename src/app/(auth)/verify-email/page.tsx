import { CircleAlert, MailCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { presentIdentityError } from '@/modules/identity';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { identity } from '@/server/auth';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

/**
 * Consumes an email verification link.
 *
 * ── Why this is a page and not a route handler ──────────────────────────────────
 * The person clicking has to *see* what happened. A route handler that redirected
 * would have to encode the outcome in a query string, which the next page would
 * have to trust — and an expired link deserves a real explanation and a way to ask
 * for another, not a bare "?error=1".
 *
 * ── Why it does not sign anyone in ──────────────────────────────────────────────
 * The token proves receipt of mail, nothing more. Verification links get prefetched
 * by scanners and forwarded between inboxes; issuing a session here would turn
 * every one of those into a login. The user signs in normally afterwards.
 *
 * Dynamic by necessity — it mutates on GET, which is why it can never be cached.
 */
export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await identity().confirmEmail(token ?? '');

  if (result.ok) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full border border-line bg-surface text-up">
          <MailCheck className="size-6" />
        </span>
        <h1 className="mt-7 text-3xl font-semibold">Email confirmed</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Your address is verified. Sign in to pick up where you left off.
        </p>
        <ButtonLink href="/login" size="lg" sheen className="mt-8 w-full">
          Continue to log in
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full border border-line bg-surface text-warn">
        <CircleAlert className="size-6" />
      </span>
      <h1 className="mt-7 text-3xl font-semibold">That link did not work</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        {presentIdentityError(result.error)}
      </p>
      <ButtonLink href="/login" size="lg" className="mt-8 w-full">
        Go to log in
      </ButtonLink>
      <p className="mt-5 text-xs text-fg-subtle">
        Signed in already? You can send yourself a new link from your account.
      </p>
    </div>
  );
}
