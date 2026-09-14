'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { HEARTBEAT_INTERVAL_MS, normalisePath } from '@/modules/presence';

import {
  PRECISE_LOCATION_KEY,
  PRESENCE_ENDPOINT,
  VISITOR_ID_KEY,
} from './presence-storage';

/**
 * Reports which page this tab is on, and where in the world it is.
 *
 * Renders nothing. It is mounted once in the root layout and is a leaf by
 * construction — no children, no context, no state that anything else reads — so
 * the cost of it being a Client Component is this file and not the tree below it.
 *
 * ── Location, with and without permission ──────────────────────────────────────
 * Two paths, and only one of them involves the visitor:
 *
 *  1. **Always.** The server derives a coarse location from the connection itself.
 *     Nothing here participates; there is nothing to grant and nothing to refuse.
 *  2. **When granted.** If the browser already holds a geolocation grant for this
 *     origin, a precise fix is watched and attached to each beat.
 *
 * What this deliberately never does is *ask*. `watchPosition` is called only after
 * the Permissions API confirms the grant already exists, so nothing here can raise
 * a permission prompt. An unprompted geolocation dialog on page load is the kind of
 * thing browsers now suppress and visitors reflexively deny, and denying it is
 * sticky — a prompt fired at the wrong moment does not just fail, it permanently
 * removes the option. Asking belongs to a control the visitor chose to press; see
 * `PreciseLocationControl` on the settings page.
 */
export function PresenceReporter() {
  const pathname = usePathname();

  /** The latest device fix, or null. Written by the watcher below, read by beats. */
  const fixRef = useRef<DeviceFix | null>(null);
  /** Cadence, as the server last asked for it. */
  const intervalRef = useRef(HEARTBEAT_INTERVAL_MS);
  /** Lets the location watcher force a beat the moment a first fix arrives. */
  const beatRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Applied here as well as on the server so a query string is dropped before it
    // is put on the wire, not after it arrives. `/reset-password?token=…` must not
    // leave the tab. The server re-applies it regardless: a rule enforced in the
    // browser is a convenience, never a control.
    const path = normalisePath(pathname) ?? '/';

    let stopped = false;
    let timer: number | null = null;

    const send = async (event: 'heartbeat' | 'leave'): Promise<void> => {
      const visitorId = ensureVisitorId();
      if (visitorId === null) return;

      try {
        const response = await fetch(PRESENCE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            visitorId,
            path,
            event,
            engagement: document.visibilityState === 'visible' ? 'engaged' : 'backgrounded',
            device: fixRef.current,
          }),
          // Presence must never keep a navigation alive or hold a connection open
          // behind a real request.
          keepalive: event === 'leave',
          cache: 'no-store',
        });

        if (response.status === 409) {
          // This context id belongs to another account — ordinarily this tab
          // signed out and back in as someone else. A new identity is a new
          // browsing context, so take a new id and let the next beat use it.
          forgetVisitorId();
          return;
        }

        if (response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const next = (body as { nextBeatMs?: unknown } | null)?.nextBeatMs;
          if (typeof next === 'number' && next >= 1_000 && next <= 600_000) {
            intervalRef.current = next;
          }
        }
      } catch {
        // Offline, a blocked request, or a navigation that cancelled it. Presence
        // is telemetry: it never surfaces a failure to the visitor, and the next
        // beat simply tries again.
      }
    };

    const tick = (): void => {
      void send('heartbeat').finally(() => {
        if (!stopped) timer = window.setTimeout(tick, intervalRef.current);
      });
    };

    // Immediately, so arriving on a page registers now rather than in twenty
    // seconds. This effect re-runs on every navigation, which is what makes a
    // route change its own beat.
    tick();
    beatRef.current = () => {
      if (!stopped) void send('heartbeat');
    };

    const onVisibility = (): void => {
      // Both directions matter: going hidden marks the tab idle straight away
      // rather than after the window expires, and coming back marks it active
      // rather than waiting for the next scheduled beat.
      void send('heartbeat');
    };

    const onPageHide = (): void => {
      // `sendBeacon`, not `fetch`. The document is being torn down and a normal
      // request is cancelled with it; a beacon is handed to the browser to deliver
      // afterwards. `pagehide` rather than `unload`, which is ignored outright in
      // browsers that implement the back-forward cache.
      const visitorId = readVisitorId();
      if (visitorId === null) return;

      const payload = JSON.stringify({ visitorId, path, event: 'leave' });
      navigator.sendBeacon?.(
        PRESENCE_ENDPOINT,
        new Blob([payload], { type: 'application/json' }),
      );
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      stopped = true;
      beatRef.current = null;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [pathname]);

  useEffect(() => watchPreciseLocation(fixRef, beatRef), []);

  return null;
}

interface DeviceFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  readonly observedAt: string;
}

/**
 * Follows the device position, but only while the grant already exists.
 *
 * Subscribed to the permission rather than read once, so granting it from the
 * settings page starts the watch in every open tab without a reload, and revoking
 * it in the browser's own UI stops it just as immediately. That symmetry is the
 * reason this is a subscription: a one-time check at mount would keep reporting a
 * position after the visitor had taken the permission away.
 */
function watchPreciseLocation(
  fixRef: React.RefObject<DeviceFix | null>,
  beatRef: React.RefObject<(() => void) | null>,
): () => void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return () => {};
  }

  let cancelled = false;
  let watchId: number | null = null;
  let status: PermissionStatus | null = null;

  const start = (): void => {
    if (cancelled || watchId !== null) return;

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const first = fixRef.current === null;
        fixRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          observedAt: new Date(position.timestamp).toISOString(),
        };
        // Report the first fix straight away instead of letting it wait out the
        // rest of the interval; after that the scheduled beats carry it.
        if (first) beatRef.current?.();
      },
      () => {
        // Position unavailable, timed out, or the grant was withdrawn mid-watch.
        // Dropping the fix is what lets it age out of the console honestly rather
        // than freezing at wherever it last was.
        fixRef.current = null;
      },
      {
        // Low accuracy on purpose: a city block is all the console shows, and
        // high accuracy means the GPS radio and a measurable battery cost.
        enableHighAccuracy: false,
        // A fix from the last five minutes is fine and costs nothing to reuse.
        maximumAge: 300_000,
        timeout: 15_000,
      },
    );
  };

  const stop = (): void => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    fixRef.current = null;
  };

  const sync = (): void => {
    if (status?.state === 'granted') start();
    else stop();
  };

  if (navigator.permissions?.query) {
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener('change', sync);
        sync();
      })
      .catch(() => {
        // Some browsers reject the geolocation descriptor outright. Fall back to
        // our own record of the visitor having opted in, below.
        if (!cancelled && hasOptedIn()) start();
      });
  } else if (hasOptedIn()) {
    // No Permissions API — older Safari. `watchPosition` would prompt if the grant
    // did not exist, so it is called only when the visitor has already granted it
    // once through the settings control, which is the only thing that writes this
    // flag.
    start();
  }

  return () => {
    cancelled = true;
    status?.removeEventListener('change', sync);
    stop();
  };
}

function hasOptedIn(): boolean {
  try {
    return window.localStorage.getItem(PRECISE_LOCATION_KEY) === 'on';
  } catch {
    // Storage can be unavailable in a private window or blocked by policy.
    return false;
  }
}

/** Reads the id for this tab, minting one on first use. Null if storage is blocked. */
function ensureVisitorId(): string | null {
  const existing = readVisitorId();
  if (existing !== null) return existing;

  const minted = randomUuid();
  try {
    window.sessionStorage.setItem(VISITOR_ID_KEY, minted);
    return minted;
  } catch {
    // Storage blocked. Reporting anonymously with a per-page id would write a new
    // row on every navigation and inflate the visitor count, so report nothing.
    return null;
  }
}

function readVisitorId(): string | null {
  try {
    return window.sessionStorage.getItem(VISITOR_ID_KEY);
  } catch {
    return null;
  }
}

function forgetVisitorId(): void {
  try {
    window.sessionStorage.removeItem(VISITOR_ID_KEY);
  } catch {
    /* nothing to forget if storage is unavailable */
  }
}

/**
 * A v4 UUID, with a fallback for insecure contexts.
 *
 * `crypto.randomUUID` exists only in a secure context, so it is absent over plain
 * HTTP — which includes reviewing a preview build on a LAN address. The fallback
 * sets the version and variant bits by hand because the server validates the shape,
 * and a string of random hex is not a UUID.
 */
function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
