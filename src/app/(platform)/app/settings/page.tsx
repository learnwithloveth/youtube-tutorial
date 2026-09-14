import type { Metadata } from 'next';

import { getSessions, requireUser } from '@/server/auth';
import { getWalletFor } from '@/server/ledger';

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
 * saved. The daily limit is the ledger's, checked against the same number a
 * withdrawal is refused by. The session list is live rows from `identity.sessions`
 * with a working "sign out everywhere". Precise location feeds the presence
 * context, and the notification switch registers this device with Cloud Messaging.
 *
 * The API keys and trading-controls tabs are gone rather than mocked — see the
 * shell for what was removed and why.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser('/app/settings');

  // Both reads are independent and neither is allowed to fail the page: a session
  // list that cannot be read is an empty panel, and a wallet that cannot be read
  // is a limit the page says it could not fetch — not a limit of zero.
  const [sessions, wallet] = await Promise.allSettled([getSessions(), getWalletFor(user.id)]);

  return (
    <SettingsShell
      user={user}
      limits={
        wallet.status === 'fulfilled' && !wallet.value.degraded ? wallet.value.limits : null
      }
      sessions={
        <ActiveSessions sessions={sessions.status === 'fulfilled' ? sessions.value : []} />
      }
    />
  );
}
