import type { Metadata } from 'next';

import { BRAND } from '@/modules/content';
import { googleOAuthConfig } from '@/platform/env';
import { describeRequest } from '@/server/request-context';
import { dialCodeFor } from '@/shared/lib/phone';

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
  description: `Open a ${BRAND.name} account in under two minutes and trade 340+ assets with fees from 0.00%.`,
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

export default async function SignupPage() {
  /*
   * Where the request appears to come from, used only as a default.
   *
   * The same resolver the presence board and the audit trail use — CDN headers
   * first, an address lookup behind them — so this costs a cache hit rather than a
   * new round trip for anyone the site has already seen. It resolves to null with
   * no database, behind a proxy that hides the address, or when every provider
   * declines, and the form then opens on no country at all.
   *
   * It is a guess about a network address, never a statement about a person, which
   * is why the field says where the value came from and stays editable.
   */
  const { location } = await describeRequest();
  const detectedCountry = location?.country ?? null;

  // With no credentials the button is not rendered, rather than rendered and dead.
  return (
    <SignupForm
      googleEnabled={googleOAuthConfig() !== null}
      detectedCountry={detectedCountry}
      detectedDialCode={dialCodeFor(detectedCountry)}
    />
  );
}
