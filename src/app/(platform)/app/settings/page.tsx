import type { Metadata } from 'next';

import { getSessions, requireUser } from '@/server/auth';

import { ActiveSessions } from './_components/active-sessions';
import { SettingsShell } from './_components/settings-shell';

/**
 * Settings.
 *
 * ── A Server Component wrapping a client shell ─────────────────────────────────
 * The page reads the session list on the server and passes it down as a rendered
 * slot; the shell is interactive (tabs, toggles, a clipboard) and hydrates. The
 * same arrangement the navbar uses, and for the same reason: the data needs the
 * server and the chrome needs the browser.
 *
 * ── What is real here, and what is not ─────────────────────────────────────────
 * The session list is real — live rows from `identity.sessions`, with a working
 * "sign out everywhere" that revokes them server-side. The precise-location control
 * on this page is real. The rest of the tabs — API keys, limits, notification
 * preferences, the profile form — are still fixtures, because each needs a context
 * this application has not built. They are left visibly as they were rather than
 * wired to something that looks real and is not.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  await requireUser('/app/settings');
  const sessions = await getSessions();

  return <SettingsShell sessions={<ActiveSessions sessions={sessions} />} />;
}
