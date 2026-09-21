import type { Metadata } from 'next';

import { googleOAuthConfig } from '@/platform/env';
import { getSessions, getSignInMethodsFor, requireUser } from '@/server/auth';
import { getVerificationStandingFor } from '@/server/verifications';
import { getLinkedWalletsFor, isWalletLinkEnabledFor } from '@/server/wallet-link';
import type { UserId } from '@/shared/kernel/ids';

import { ActiveSessions } from './_components/active-sessions';
import { SettingsShell } from './_components/settings-shell';
import { WalletIntegration } from './_components/wallet-integration';

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
  const [sessions, verification, methods, walletsEnabled] = await Promise.allSettled([
    getSessions(),
    getVerificationStandingFor(user.id),
    getSignInMethodsFor(user.id),
    isWalletLinkEnabledFor(user.id as UserId),
  ]);

  /*
   * The wallet board is read only when the account has turned the feature on.
   *
   * Off is the common case — most people here will never connect an external
   * wallet — and reading a table to render nothing is a round trip per settings
   * visit for no one's benefit. A rejected setting read degrades to `false`, which
   * shows the enable panel: inert, and re-checked on every write regardless.
   */
  const walletsOn = walletsEnabled.status === 'fulfilled' && walletsEnabled.value;
  const walletBoard = walletsOn ? await getLinkedWalletsFor(user.id as UserId) : null;

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
      walletsEnabled={walletsOn}
      wallets={
        walletBoard === null ? null : (
          <WalletIntegration
            // board={walletBoard}
            // appUrl={env().APP_URL}
            // siteName={BRAND.name}
            /* Absent is a supported configuration: the QR option is then not
               offered at all, rather than offered and unable to pair. */
            // projectId={env().NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? null}
          />
        )
      }
      googleNotice={typeof google === 'string' ? google : undefined}
      // The callback lands here with `?google=`, so that outcome opens on the tab
      // that shows it rather than on Profile.
      initialTab={typeof tab === 'string' ? tab : google === undefined ? undefined : 'security'}
    />
  );
}
