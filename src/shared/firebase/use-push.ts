'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';

import { firebaseApp, VAPID_KEY } from './client';

/**
 * Web push registration.
 *
 * ── Permission is asked for on a click, never on load ──────────────────────────
 * A browser that is asked for notification permission the moment a page loads gets
 * it denied — by the person, and increasingly by the browser itself, which blocks
 * the prompt outright when it is not tied to a gesture. Worse, a denial is sticky:
 * the site cannot ask again, and the only cure is the user finding a setting.
 *
 * So this exposes `enable()` for a button to call and does nothing on its own.
 *
 * ── What it cannot do, stated plainly ─────────────────────────────────────────
 * Safari on iOS delivers web push only to a site the user has added to their Home
 * Screen. There is no way to detect that reliably and nothing to be done about it
 * in code; `supported` reports what the browser admits to, and the UI says the rest.
 */

export type PushState =
  | 'unsupported'
  | 'unconfigured'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'working';

export function usePush(): {
  state: PushState;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>('unconfigured');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (firebaseApp() === null || VAPID_KEY.length === 0) return;

      // `isSupported()` rather than feature-sniffing: FCM needs a service worker,
      // the Push API *and* IndexedDB, and the combination is absent in more places
      // than any one check would suggest — private windows and older Safari among
      // them.
      const ok = await isSupported().catch(() => false);
      if (cancelled) return;

      if (!ok) {
        setState('unsupported');
        return;
      }

      setState(
        Notification.permission === 'granted'
          ? 'granted'
          : Notification.permission === 'denied'
            ? 'denied'
            : 'prompt',
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    const app = firebaseApp();
    if (app === null || VAPID_KEY.length === 0) return;

    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'prompt');
        return;
      }

      // The worker is registered by hand rather than left to the SDK, because the
      // project config has to reach it — a file in `public/` has no build step to
      // substitute environment variables into it. See the worker's own comment.
      const options = app.options;
      const query = new URLSearchParams({
        apiKey: String(options.apiKey ?? ''),
        authDomain: String(options.authDomain ?? ''),
        projectId: String(options.projectId ?? ''),
        appId: String(options.appId ?? ''),
        messagingSenderId: String(options.messagingSenderId ?? ''),
      });

      const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${query.toString()}`,
        { scope: '/' },
      );

      const token = await getToken(getMessaging(app), {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        setState('prompt');
        return;
      }

      await fetch('/api/support/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      setState('granted');
    } catch {
      // A failure here costs notifications, never the page. The console keeps
      // working; it just does not buzz.
      setState('prompt');
    }
  }, []);

  /**
   * Stops notifications reaching this browser.
   *
   * Deletes the registration rather than storing an "off" preference, because the
   * token *is* the subscription: a row that exists is a device that gets messages.
   * The browser permission is deliberately left alone — revoking it is not
   * something a page is allowed to do, and re-enabling would otherwise need the
   * person to go into their browser settings for a switch they just used.
   */
  const disable = useCallback(async () => {
    const app = firebaseApp();
    if (app === null) return;

    setState('working');
    try {
      const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY }).catch(
        () => null,
      );
      if (token) {
        await fetch('/api/support/devices', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
      }
      // Back to `prompt`, not `denied`: permission is still granted, there is just
      // nothing registered to send to. The switch can be turned straight back on.
      setState('prompt');
    } catch {
      setState('granted');
    }
  }, []);

  return { state, enable, disable };
}

/**
 * Foreground messages.
 *
 * The service worker only handles notifications while the tab is in the
 * background — the browser deliberately does not draw one over a page the user is
 * already looking at. So a tab with the console open would receive nothing visible
 * at all without this.
 */
export function useForegroundPush(onArrive: () => void): void {
  useEffect(() => {
    const app = firebaseApp();
    if (app === null) return;

    let unsubscribe: (() => void) | undefined;

    void isSupported()
      .then((ok) => {
        if (!ok) return;
        unsubscribe = onMessage(getMessaging(app), () => onArrive());
      })
      .catch(() => undefined);

    return () => unsubscribe?.();
  }, [onArrive]);
}
