import type { Metadata } from 'next';

import { googleOAuthConfig } from '@/platform/env';

import { SignupForm } from './_components/signup-form';

/**
 * A thin Server Component wrapper.
 *
 * The form itself is interactive and must be a Client Component, and a Client
 * Component cannot export `metadata`. Keeping the route's `page.tsx` on the
 * server is what lets this page carry a title, a description and — importantly
 * for a sign-in screen — `noindex`.
 */
export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Open a Novex account in under two minutes and trade 340+ assets with fees from 0.00%.',
  // Authentication screens have nothing to offer a search result, and indexing
  // them invites phishing pages to rank beside the real one.
  robots: { index: false, follow: false },
};

/**
 * Rendered per request, for the reason the login page gives: the Google button's
 * presence is read from the environment, and prerendering would freeze the answer
 * at build time.
 */
export const dynamic = 'force-dynamic';

export default function SignupPage() {
  // With no credentials the button is not rendered, rather than rendered and dead.
  return <SignupForm googleEnabled={googleOAuthConfig() !== null} />;
}
