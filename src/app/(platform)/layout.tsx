import { requireUser } from '@/server/auth';

import { DashboardShell } from './_components/dashboard-shell';

/**
 * The signed-in application.
 *
 * ── The gate ────────────────────────────────────────────────────────────────────
 * `requireUser` runs on the server before any child renders, and redirects to
 * `/login?next=<path>` when there is no session. Putting it in the layout means
 * every route under `(platform)` is covered by construction: a new page added
 * tomorrow is protected without anyone remembering to protect it.
 *
 * This is also the first caller of `requireUser`, which is why the `next`
 * round-trip finally does something — before this, signing in always landed on
 * the marketing home page because nothing ever set a return path.
 *
 * The check is not a substitute for authorisation inside each mutation. A layout
 * guard stops someone *browsing* here; it does nothing about a Server Action
 * invoked directly, which is why actions re-derive their own authority.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser('/app');

  return <DashboardShell email={user.email}>{children}</DashboardShell>;
}
