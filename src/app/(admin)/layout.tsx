import { requireAdmin } from '@/server/auth';

import { AdminProvider } from './_data/store';
import { AdminShell } from './_components/admin-shell';

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
 * ── The console's state is in memory ────────────────────────────────────────────
 * `AdminProvider` holds a reducer over demo fixtures. Approving something on one
 * screen updates the rail badge, the command-centre counters and the audit log
 * because they all read the same state — and a reload resets it, because there
 * is no backend behind any of it. See `_data/README.md`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin('/admin');

  return (
    <AdminProvider>
      <AdminShell email={user.email}>{children}</AdminShell>
    </AdminProvider>
  );
}
