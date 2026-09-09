import type { Metadata } from 'next';

import { TwoFactorForm } from './_components/two-factor-form';

/**
 * A thin Server Component wrapper.
 *
 * The form itself is interactive and must be a Client Component, and a Client
 * Component cannot export `metadata`. Keeping the route's `page.tsx` on the
 * server is what lets this page carry a title, a description and — importantly
 * for a sign-in screen — `noindex`.
 */
export const metadata: Metadata = {
  title: 'Two-factor verification',
  description: 'Confirm the six-digit code from your authenticator to finish signing in.',
  // Authentication screens have nothing to offer a search result, and indexing
  // them invites phishing pages to rank beside the real one.
  robots: { index: false, follow: false },
};

export default function TwoFactorPage() {
  return <TwoFactorForm />;
}
