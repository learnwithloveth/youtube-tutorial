import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BRAND } from '@/modules/content';
import { googleOAuthConfig } from '@/platform/env';

import { LoginForm } from './_components/login-form';

/**
 * A thin Server Component wrapper.
 *
 * The form itself is interactive and must be a Client Component, and a Client
 * Component cannot export `metadata`. Keeping the route's `page.tsx` on the
 * server is what lets this page carry a title, a description and — importantly
 * for a sign-in screen — `noindex`.
 */
export const metadata: Metadata = {
  title: 'Log in',
  description: `Sign in to your ${BRAND.name} account with a passkey, a password, or a linked provider.`,
  // Authentication screens have nothing to offer a search result, and indexing
  // them invites phishing pages to rank beside the real one.
  robots: { index: false, follow: false },
};

/**
 * Rendered per request, because whether Google is configured is read from the
 * environment — and a prerendered page would bake in whatever was set at *build*
 * time. An image built without credentials and deployed with them would show no
 * button, which is the kind of bug that looks like the feature was never shipped.
 */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const googleEnabled = googleOAuthConfig() !== null;

  // `LoginForm` reads `next` and `reset` from the query string via
  // `useSearchParams`, which forces a client-side bailout. Without a boundary
  // that bailout propagates to the whole route and Next refuses to prerender it;
  // with one, the shell is still static and only the form waits.
  return (
    <Suspense fallback={<div className="min-h-[28rem]" aria-hidden />}>
      <LoginForm googleEnabled={googleEnabled} />
    </Suspense>
  );
}
