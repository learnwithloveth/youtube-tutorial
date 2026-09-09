import type { Metadata } from 'next';

import { ResetPasswordForm } from './_components/reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

/**
 * A thin Server Component wrapper.
 *
 * The token arrives in the query string and is handed to the form as a hidden
 * field, so the action receives it with the submission rather than the client
 * having to read the URL. Nothing is verified here — the token is checked when it
 * is redeemed, in one place, by the use case.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? ''} />;
}
