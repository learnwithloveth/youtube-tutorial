'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Browser-only hooks.
 *
 * The whole file is a client module. Each hook reads `window`, `document` or a
 * media query, so anything importing one is necessarily interactive — marking
 * the file rather than each consumer keeps the boundary in one obvious place.
 *
 * Every hook starts from the value the server would have produced and corrects
 * after mount, so the first client render matches the server's HTML and
 * hydration does not warn.
 */

/**
 * SSR-safe media query subscription.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, because a media
 * query *is* an external store and React has a purpose-built API for one. The
 * effect version had to call `setState` during the effect to catch the initial
 * value, which schedules a second render on every mount — the pattern React 19's
 * lint rules now flag. This subscribes once and reads the current value
 * directly.
 *
 * The third argument is the server snapshot. It returns false so the server and
 * the first client render agree; the real value arrives on subscribe, without a
 * hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Tracks whether the window has been scrolled past `threshold` px.
 *
 * Also a subscription to an external value, so also `useSyncExternalStore`. The
 * listener is passive and the read is a bare property access, which keeps this
 * off the scroll path's critical work.
 */
export function useScrolled(threshold = 12): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('scroll', onChange, { passive: true });
    return () => window.removeEventListener('scroll', onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.scrollY > threshold,
    () => false,
  );
}

/**
 * Writes normalised pointer coordinates onto the element as --mx/--my so the
 * `.spotlight` effect renders entirely in CSS — no React re-render per move.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    node.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }, []);
  return { ref, onPointerMove };
}

/** Locks body scroll while `active` — used by the mobile drawer and dialogs. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Fires `handler` on Escape. */
export function useEscape(handler: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, active]);
}

/** Interval that pauses while the tab is hidden. */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') saved.current();
    }, delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}
