import type { NextConfig } from 'next';

/**
 * ── Why the client router is allowed to hold a page for thirty seconds ─────────
 * Next 15 changed the `dynamic` staleTime default from 30s to 0, which means a
 * dynamic page is re-fetched on *every* navigation — including navigating back to
 * one you looked at ten seconds ago. Almost every screen in this application is
 * `force-dynamic`, because almost every screen reads a balance, a quote or a
 * session, so the default costs a full server render plus its database round trips
 * on each move between two tabs of the same dashboard.
 *
 * Thirty seconds is chosen against what the data actually is:
 *
 *  - Prices already carry their own freshness. `Market.quoteStateAt()` returns
 *    `live | stale | unavailable` and the interface says which, so a quote held
 *    briefly by the router does not become a quote pretending to be current.
 *  - Balances and queues change only when somebody acts, and every action that
 *    moves them is a Server Action that already calls `revalidatePath`, which
 *    evicts this cache for the affected route. The staleness is bounded by the
 *    mutation, not by the timer.
 *
 * `static: 300` is the framework default, restated so the pair is readable
 * together rather than one visible number and one implied one.
 *
 * ── The cost of getting this wrong ────────────────────────────────────────────
 * A figure up to thirty seconds old on a screen somebody is navigating around. The
 * places where that is not acceptable — an approval queue an operator is working,
 * a chat thread — do not rely on this: they revalidate on write or hold their own
 * realtime subscription.
 */
const nextConfig: NextConfig = {
  /**
   * ── The site's name and description, from the environment ────────────────────
   * Client Components render the name too — the logo's label, the top bar, the
   * support widget — so the browser bundle has to see the same value the server
   * rendered with, or the two disagree at hydration and React throws the tree away.
   * A `NEXT_PUBLIC_` prefix would arrange that, but these are named `WEBSITE_NAME`
   * and `WEBSITE_DESCRIPTION`; `env` inlines exactly these two, under those names.
   *
   * Inlined at build time, which is the cost: after changing either, restart
   * `next dev` or rebuild. The fallbacks when they are unset live in
   * `modules/content/infrastructure/brand.ts`.
   */
  env: {
    WEBSITE_NAME: process.env.WEBSITE_NAME ?? '',
    WEBSITE_DESCRIPTION: process.env.WEBSITE_DESCRIPTION ?? '',
  },
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
