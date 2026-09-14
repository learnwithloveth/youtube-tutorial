'use client';

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * The console's query cache.
 *
 * ── Why the console has one at all ─────────────────────────────────────────────
 * Almost every screen here reads on the server and renders once, which needs no
 * cache. The transaction feed is the exception: it pages as an operator scrolls,
 * which means accumulating pages, tracking a cursor, de-duplicating in-flight
 * requests and surviving a filter change — state that has to live in the browser
 * because that is where the scrolling happens.
 *
 * Mounted on the transaction page rather than in the console's layout, so that is
 * the only route that downloads it — the same rule `'use client'` follows. The
 * browser-side client is still a module singleton, so a cache survives navigating
 * away and back.
 *
 * ── One client per server render, one per browser ──────────────────────────────
 * A module-level client would be shared by every request the server handles, which
 * on a console means one operator's cache answering another operator's page. So
 * the server builds a fresh client each time and the browser keeps a single one —
 * the browser's has to persist, or a suspended re-render would throw away every
 * page already loaded and start the feed over.
 */

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Long enough that scrolling back up does not refetch, short enough that a
         * reopened tab is not reading yesterday.
         */
        staleTime: 30_000,
        /**
         * Off, deliberately.
         *
         * Refocusing would refetch *every* accumulated page of the feed at once —
         * an operator who alt-tabs after scrolling through four hundred rows would
         * fire twenty requests to learn nothing, because a decided transaction
         * does not change. New rows arrive at the top, and the page has a refresh
         * control for exactly that.
         */
        refetchOnWindowFocus: false,
        /** One retry. A console that hides a failing backend behind six is worse. */
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function ConsoleQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
