'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-renders the page it sits on, so an open tab keeps up with the prices.
 *
 * ── Why a router refresh and not a fetch ─────────────────────────────────────
 * The prices on these screens are rendered on the server, beside balances and
 * freshness badges that are computed from the same read. Fetching quotes into the
 * client would mean a second source for the same numbers and a second set of rules
 * about when to call one stale — so this asks the server to render again and
 * everything on the page moves together, including the "Stale" badge itself.
 *
 * ── What it deliberately does not do ─────────────────────────────────────────
 * It does not invent motion between refreshes. An earlier version of this product
 * shipped a simulated ticker that nudged prices every 1.5 seconds from a seeded
 * random number generator; what it drew was never a price anybody could trade at.
 * The number on screen here is the last observation the feed actually returned.
 *
 * A hidden tab refreshes nothing. Somebody with the dashboard parked in a
 * background tab for a working day should not be re-rendering it 480 times.
 */
export function QuoteRefresher({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = Math.max(15, seconds) * 1000;

    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
    }, interval);

    // And once on becoming visible again, so a tab returned to after an hour is
    // current by the time it is read rather than at the end of the next interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, seconds]);

  return null;
}
