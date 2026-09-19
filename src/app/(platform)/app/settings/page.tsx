import type { Metadata } from 'next';

import { googleOAuthConfig } from '@/platform/env';
import { getSessions, getSignInMethodsFor, requireUser } from '@/server/auth';
import { getVerificationStandingFor } from '@/server/verifications';

import { ActiveSessions } from './_components/active-sessions';
import { SettingsShell } from './_components/settings-shell';

/**
 * Settings.
 *
 * ── A Server Component wrapping a client shell ─────────────────────────────────
 * The page reads the account, its limit and its sessions on the server; the shell
 * is interactive — tabs and switches — and hydrates. The same arrangement the
 * navbar uses, and for the same reason: the data needs the server and the chrome
 * needs the browser.
 *
 * ── What is real here ──────────────────────────────────────────────────────────
 * All of it, now. The profile is the signed-in account's own row, editable and
 * saved. The session list is live rows from `identity.sessions` with a working
 * "sign out everywhere". Precise location feeds the presence context, and the
 * notification switch registers this device with Cloud Messaging. Verification
 * reads the account's own identity submissions and files new ones.
 *
 * The API keys, trading-controls and limits tabs are gone — see the shell for what
 * was removed and why. The wallet is no longer read here at all, because the daily
 * limit was the only thing this page wanted from it.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. `?tab=verification` is how the overview's
  // prompt opens this page on the right tab.
  searchParams: Promise<{ tab?: string | string[]; google?: string | string[] }>;
}) {
  const user = await requireUser('/app/settings');
  const { tab, google } = await searchParams;

  // The reads are independent and none is allowed to fail the page: a session list
  // that cannot be read is an empty panel, and a verification that cannot be read
  // says so rather than claiming the account is unverified.
  const [sessions, verification, methods] = await Promise.allSettled([
    getSessions(),
    getVerificationStandingFor(user.id),
    getSignInMethodsFor(user.id),
  ]);

  return (
    <SettingsShell
      user={user}
      sessions={
        <ActiveSessions sessions={sessions.status === 'fulfilled' ? sessions.value : []} />
      }
      verification={
        verification.status === 'fulfilled' ? verification.value : { state: 'unavailable' }
      }
      signInMethods={methods.status === 'fulfilled' ? methods.value : null}
      googleConfigured={googleOAuthConfig() !== null}
      googleNotice={typeof google === 'string' ? google : undefined}
      // The callback lands here with `?google=`, so that outcome opens on the tab
      // that shows it rather than on Profile.
      initialTab={typeof tab === 'string' ? tab : google === undefined ? undefined : 'security'}
    />
  );
}
