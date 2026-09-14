import type { Metadata } from 'next';

import { getLiveActivity } from '@/server/presence';

import { AdminPageHeader } from '../../_components/admin-ui';
import { LiveBoard } from './_components/live-board';

/**
 * Live activity — who is on the site, where in the world, and on which page.
 *
 * ── Server reads, client refreshes ─────────────────────────────────────────────
 * The first snapshot is read here, during render, so the console is useful the
 * instant it opens rather than after a round trip. Everything after that is the
 * client island's job, because a Server Component cannot re-render itself on a
 * timer. This page never fetches its own route handler — it calls the same facade
 * the handler does.
 *
 * ── No caching, at any layer ───────────────────────────────────────────────────
 * `force-dynamic` rather than a short `revalidate`. A cached "live" board is a
 * contradiction, and worse, ISR would serve one operator's snapshot — which names
 * accounts — to whoever asked next.
 *
 * The `(admin)` layout has already run `requireAdmin`, so by the time this renders
 * the visitor is an operator. The route handler behind the refresh re-derives that
 * for itself; a layout guard protects a page, never a URL.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live activity',
  // Nothing under /admin should ever be indexed, and this page in particular
  // describes named people in real time.
  robots: { index: false, follow: false },
};

export default async function LiveActivityPage() {
  const snapshot = await getLiveActivity();

  return (
    <>
      <AdminPageHeader
        title="Live activity"
        description="Everyone on the site right now, the page they are on, and where they are connecting from. Locations come from the connection unless a visitor granted precise location — each row says which."
      />
      <LiveBoard initial={snapshot} />
    </>
  );
}
