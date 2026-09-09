import type { Metadata } from 'next';

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

export default function SignupPage() {
  return <SignupForm />;
}
