import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSETS } from './assets';
import type { Asset, Quote } from './types';
import { buildSpark, seededRandom, hashSeed, tickPrice } from './simulation';

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
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(source.map((a) => [a.id, a.price])),
  );
  const previous = useRef<Record<string, number>>(prices);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setPrices((current) => {
        previous.current = current;
        const next: Record<string, number> = {};
        for (const asset of source) {
          next[asset.id] = tickPrice(asset.price, current[asset.id] ?? asset.price, rand.current);
        }
        return next;
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [source, enabled]);

  return useMemo(
    () =>
      source.map((asset) => {
        const live = prices[asset.id] ?? asset.price;
        const before = previous.current[asset.id] ?? live;
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
