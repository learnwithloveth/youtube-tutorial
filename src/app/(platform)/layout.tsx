import { requireUser } from '@/server/auth';
import { getMySupportThread, support } from '@/server/support';

import { AnnouncementBanner } from '../_components/announcement-banner';

import { DashboardShell } from './_components/dashboard-shell';
import { SupportWidget } from './_components/support-widget';

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
 *
 * ── The support widget is mounted here, with its thread already read ───────────
 * In the layout because a customer should be able to ask a question from wherever
 * they got stuck, not only from a page that remembered to include it.
 *
 * The existing thread is read on the server and passed down, so the panel opens
 * showing the conversation instead of a spinner. The widget attaches its Firestore
 * listener only once somebody opens it — a customer who never contacts support
 * should not hold a realtime connection on every page of the application.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser('/app');

  // Null when no Firebase project is configured. The widget is then simply absent,
  // which is the same way a missing database degrades the rest of the platform.
  const configured = support() !== null;
  const thread = configured
    ? await getMySupportThread(user.id)
    : { conversation: null, messages: [] };

  return (
    <DashboardShell
      name={user.name}
      initials={user.initials}
      email={user.email}
      emailVerified={user.emailVerified}
      // Both surfaces, because a customer on an app page should see a site-wide
      // notice as well as one written for signed-in people. The `in-app` surface
      // is what a notice uses when it is *only* meant for them.
      notice={
        <>
          <AnnouncementBanner surface="banner" />
          <AnnouncementBanner surface="in-app" />
        </>
      }
    >
      {children}
      {configured ? (
        <SupportWidget
          userId={user.id}
          initialConversation={thread.conversation}
          initialMessages={thread.messages}
        />
      ) : null}
    </DashboardShell>
  );
}
