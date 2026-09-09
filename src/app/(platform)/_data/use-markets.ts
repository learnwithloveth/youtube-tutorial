'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSETS } from '../../_console/data/assets';
import type { Asset, Quote } from '../../_console/data/market-types';
import { buildSpark, seededRandom, hashSeed, tickPrice } from '../../_console/data/simulation';

const TICK_MS = 1500;

/**
 * Live quote feed. Mirrors the interface a real WebSocket subscription would
 * expose (`quotes`, `isStreaming`) so swapping the transport is a one-file
 * change with zero churn in the component tree.
 */
export function useLiveQuotes(source: readonly Asset[] = ASSETS, enabled = true): Quote[] {
  const sparks = useMemo(
    () => new Map(source.map((a) => [a.id, buildSpark(a.id, a.change7d)])),
    [source],
  );
  const rand = useRef(seededRandom(hashSeed('novex-ticker')));
  /**
   * Current and previous prices are one piece of state, not a state plus a ref.
   *
   * The ported version kept the previous tick in a ref and read it during render
   * to derive the up/down flash. Reading a ref while rendering is a React
   * violation — the value is not part of the render's inputs, so a re-render
   * triggered by anything else sees a mismatched pair and the arrow points the
   * wrong way. Keeping both halves in the same state object makes the direction
   * a pure function of that state.
   */
  const [prices, setPrices] = useState<{
    current: Record<string, number>;
    previous: Record<string, number>;
  }>(() => {
    const initial = Object.fromEntries(source.map((asset) => [asset.id, asset.price]));
    return { current: initial, previous: initial };
  });

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setPrices((state) => {
        const next: Record<string, number> = {};
        for (const asset of source) {
          next[asset.id] = tickPrice(
            asset.price,
            state.current[asset.id] ?? asset.price,
            rand.current,
          );
        }
        return { current: next, previous: state.current };
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [source, enabled]);

  return useMemo(
    () =>
      source.map((asset) => {
        const live = prices.current[asset.id] ?? asset.price;
        const before = prices.previous[asset.id] ?? live;
        const delta = live - before;
        return {
          ...asset,
          live,
          direction: delta > 0.0000001 ? 'up' : delta < -0.0000001 ? 'down' : 'flat',
          spark: sparks.get(asset.id) ?? [],
        } satisfies Quote;
      }),
    [source, prices, sparks],
  );
}

export type MarketSortKey = 'marketCap' | 'price' | 'change24h' | 'volume24h' | 'name';

export function sortQuotes(quotes: Quote[], key: MarketSortKey, dir: 'asc' | 'desc'): Quote[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...quotes].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name) * factor;
    return (a[key] - b[key]) * factor;
  });
}
