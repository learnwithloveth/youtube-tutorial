'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { usePushMessages, usePushSync } from '@/shared/firebase/use-push';

/**
 * The page's side of push notifications. Renders nothing.
 *
 * ── Two jobs, both on every page of a signed-in area ─────────────────────────
 * It keeps this browser's registration true for whoever is signed in — renewed for
 * the account that turned notifications on here, removed for anybody else — which
 * is why it sits in a layout and not on the Settings page: a registration that is
 * only repaired when somebody visits Settings is broken the rest of the time.
 *
 * And when a notification arrives while a tab is open, it re-renders that tab, so
 * the bell's count and the screen behind it move with the notification instead of
 * at the next navigation. A router refresh, for the reason `QuoteRefresher` gives:
 * the server renders the bell, and one source is better than two.
 *
 * ── Except for the support queue ─────────────────────────────────────────────
 * The console keeps its own realtime listener. Re-rendering it on every customer
 * message would be a round of server reads that changes nothing on the screen.
 */
export function PushBridge({ userId }: { userId: string }) {
  const router = useRouter();
  const pending = useRef<number | null>(null);

  usePushSync(userId);

  const onPush = useCallback(
    (surface: string | null) => {
      if (surface === 'support-queue') return;

      // Coalesced: an operator crediting five deposits in a row is one refresh.
      if (pending.current !== null) window.clearTimeout(pending.current);
      pending.current = window.setTimeout(() => {
        pending.current = null;
        router.refresh();
      }, 500);
    },
    [router],
  );

  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  usePushMessages(onPush);

  return null;
}
