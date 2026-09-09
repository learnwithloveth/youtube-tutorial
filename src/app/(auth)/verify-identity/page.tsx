import type { Metadata } from 'next';

import { VerifyIdentityForm } from './_components/verify-identity-form';

/**
 * A thin Server Component wrapper.
 *
 * The form itself is interactive and must be a Client Component, and a Client
 * Component cannot export `metadata`. Keeping the route's `page.tsx` on the
 * server is what lets this page carry a title, a description and — importantly
 * for a sign-in screen — `noindex`.
 */
export const metadata: Metadata = {
  title: 'Verify your identity',
  description: 'Complete identity verification to unlock deposits, trading and withdrawals.',
  // Authentication screens have nothing to offer a search result, and indexing
  // them invites phishing pages to rank beside the real one.
  robots: { index: false, follow: false },
};

export default function VerifyIdentityPage() {
  return <VerifyIdentityForm />;
}
