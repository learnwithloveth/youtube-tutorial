import type { Metadata } from 'next';

import { getAdminFeed } from '@/server/admin-alerts';
import { requireAdmin } from '@/server/auth';
import { getPendingQueueCounts } from '@/server/console';

import { PushBridge } from '../_components/push-bridge';
import { CONSOLE_APP, pushScopeFor } from '../_lib/console-app';

import { AdminProvider } from './_data/store';
import { AdminShell } from './_components/admin-shell';
import { ConsoleReadinessGate } from './_components/console-readiness-gate';

/**
 * The console is installable as an app, and the customer site is not: this is the
 * only layout that links a manifest. See `_lib/console-app.ts`.
 */
export const metadata: Metadata = {
  manifest: CONSOLE_APP.manifest,
  // iOS reads these rather than the manifest for a Home Screen icon and its label.
  appleWebApp: { capable: true, title: 'Console' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

/**
 * The operations console.
 *
 * ── Authentication is not authorisation ─────────────────────────────────────────
 * `(platform)` only asks whether someone is signed in. This asks *who* they are:
 * `requireAdmin` sends a signed-out visitor to log in, and answers 404 for a
 * signed-in customer. A 403 would confirm the console exists, which is the first
 * thing worth knowing if you are looking for one.
 *
 * The gate is in the layout so every route beneath it is covered by
 * construction. A page added tomorrow is protected without anyone remembering.
 *
 * ── The console's state is mostly in memory, and less of it every release ──────
 * `AdminProvider` still holds a reducer over demo fixtures for the screens that
 * have no module behind them yet. The queues that *are* backed by the database are
 * counted here and passed down, so a rail badge and the page it links to cannot
 * disagree — see `QueueCounts`.
 *
 * What is left in the reducer behaves as it always did: approving something on a
 * fixture screen updates that screen's counters, and a reload resets it, because
 * there is no backend behind any of it. See `_data/README.md`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin('/admin');
  // After the gate, never before: an unauthenticated visitor must be redirected
  // without this having read anything about the platform.
  // In parallel: the queue counts and the customer-activity bell are independent
  // reads, and the feed degrades to an empty bell rather than failing the page.
  const [counted, feed] = await Promise.all([getPendingQueueCounts(), getAdminFeed(20)]);

  return (
    <AdminProvider counted={counted}>
      <AdminShell email={user.email} operatorId={user.id} initialFeed={feed}>
        {/* Here as well as in the app, because an operator may never open the
            customer side — their registration has to be kept current from this one. */}
        <PushBridge userId={user.id} scope={pushScopeFor(user.role)} />
        {/* Over everything below it, and only here: the console is the one area
            whose usefulness depends on the device being reachable. */}
        <ConsoleReadinessGate operatorId={user.id} />
        {children}
      </AdminShell>
    </AdminProvider>
  );
}
