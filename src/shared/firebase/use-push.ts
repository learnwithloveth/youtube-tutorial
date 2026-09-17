'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

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
 * So `usePush` exposes `enable()` for a button to call. `usePushSync` does run on
 * load, but only for a browser that already said yes, and it never prompts.
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

const WORKER_URL = '/firebase-messaging-sw.js';
const DEVICES_URL = '/api/support/devices';
const WORKER_TIMEOUT_MS = 10_000;

/**
 * The account this browser delivers notifications for.
 *
 * ── Why the switch is not the browser permission ──────────────────────────────
 * Permission belongs to the site, not to an account, and it outlives everything.
 * The switch used to read "on" whenever permission was granted — so allowing
 * notifications once, for the operator console, turned the switch on for every
 * account that later signed in on that browser, none of which had a registration
 * or was ever sent anything. It now reports what it controls: whether *this*
 * account asked for notifications *here*.
 *
 * One owner, because a registration is keyed by the browser's token. Two accounts
 * cannot both hold it; the last to turn notifications on is the one it belongs to.
 *
 * `RELEASING` marks a registration that was switched off but could not be removed
 * yet. It is nobody's, so the next page load tries the removal again.
 */
const OWNER_KEY = 'novex:push-owner';
const RELEASING = '!';

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(OWNER_KEY);
    else window.localStorage.setItem(OWNER_KEY, value);
  } catch {
    // Storage refused (a private window, blocked site data). The registration still
    // works for this visit; it simply will not be renewed on the next one.
  }
}

/** A step that failed, carrying the sentence the switch shows for it. */
class PushSetupError extends Error {}

export function usePush(userId: string): {
  state: PushState;
  /** Why the last attempt failed, in words for the person who pressed the switch. */
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>('unconfigured');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (firebaseApp() === null || VAPID_KEY.length === 0) return;

      const ok = await browserSupportsPush();
      if (cancelled) return;

      if (!ok) {
        setState('unsupported');
        return;
      }

      setState(
        Notification.permission === 'denied'
          ? 'denied'
          : Notification.permission === 'granted' && readOwner() === userId
            ? 'granted'
            : 'prompt',
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const enable = useCallback(async () => {
    const app = firebaseApp();
    if (app === null || VAPID_KEY.length === 0) return;

    setState('working');
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'prompt');
        return;
      }

      await saveToken(await subscribe(app));
      writeOwner(userId);
      setState('granted');
    } catch (failure) {
      report(failure);
      setError(
        failure instanceof PushSetupError
          ? failure.message
          : 'Notifications could not be turned on in this browser.',
      );
      setState('prompt');
    }
  }, [userId]);

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
    setState('working');
    setError(null);

    // Given up first: whatever happens to the request below, this browser must not
    // register the account again on its next load.
    writeOwner(RELEASING);

    if (await forgetDevice(await existingToken())) {
      writeOwner(null);
    } else {
      setError(
        'Could not reach the server to switch notifications off. This device stops receiving them the next time it can.',
      );
    }
    // Off either way. It is what was asked for, and the removal is retried.
    setState('prompt');
  }, []);

  return { state, error, enable, disable };
}

/**
 * Keeps this browser's registration current, on every page load.
 *
 * ── Why a registration has to be renewed at all ───────────────────────────────
 * It stops existing in several ordinary ways: signing out forgets it, "sign out
 * everywhere" forgets every one, a token FCM rotates is a different document, and
 * a browser that changed hands must stop receiving the previous account's alerts.
 * So a browser whose owner is the account signed in re-registers — no prompt, the
 * permission is already granted — and one whose owner is anybody else unregisters.
 *
 * Silent: it runs on every page, and the switch in Settings is where a failure is
 * worth showing.
 */
export function usePushSync(userId: string): void {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const owner = readOwner();
      if (owner === null) return;

      const app = firebaseApp();
      if (app === null || VAPID_KEY.length === 0) return;

      const permitted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      if (owner !== userId || !permitted) {
        // Somebody else's, abandoned, or its permission withdrawn in the browser.
        // The server finds the token in the cookie the registration left, so this
        // does not need Firebase, or a token, to work.
        if (await forgetDevice(null)) writeOwner(null);
        return;
      }

      if (!(await browserSupportsPush()) || cancelled) return;

      try {
        const token = await subscribe(app);
        if (cancelled) return;
        await saveToken(token);
      } catch (failure) {
        report(failure);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/**
 * Messages from the service worker.
 *
 * Two kinds. `novex:push` says a notification arrived, so a page can refresh what
 * it shows. `novex:shows-live` is the worker asking whether this tab is already
 * showing a surface live — answered from the DOM, where a surface that is marks
 * itself with `data-live-surface` — so it can skip a notification that would only
 * repeat what is on the screen.
 */
export function usePushMessages(onPush: (surface: string | null) => void): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;

    const listen = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      const { type, surface } = data as { type?: unknown; surface?: unknown };
      const named = typeof surface === 'string' ? surface : null;

      if (type === 'novex:shows-live') {
        event.ports[0]?.postMessage(named !== null && showsLive(named));
        return;
      }
      if (type === 'novex:push') onPush(named);
    };

    container.addEventListener('message', listen);
    // Messages from a worker wait in a queue until the page starts it. Assigning
    // `onmessage` starts it implicitly; `addEventListener` does not.
    container.startMessages();

    return () => container.removeEventListener('message', listen);
  }, [onPush]);
}

function showsLive(surface: string): boolean {
  if (surface !== 'support-queue' && surface !== 'support-thread') return false;
  return (
    document.hasFocus() && document.querySelector(`[data-live-surface="${surface}"]`) !== null
  );
}

/**
 * `isSupported()` rather than feature-sniffing: FCM needs a service worker, the Push
 * API *and* IndexedDB, and the combination is absent in more places than any one
 * check would suggest — private windows and older Safari among them.
 */
async function browserSupportsPush(): Promise<boolean> {
  return isSupported().catch(() => false);
}

/** Installs the worker, waits for it to run, and returns this browser's token. */
async function subscribe(app: FirebaseApp): Promise<string> {
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(WORKER_URL, { scope: '/' });
    await activated(registration);
  } catch (cause) {
    throw new PushSetupError('This browser would not start the notification service.', { cause });
  }

  let token: string;
  try {
    token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch (cause) {
    throw new PushSetupError(describeTokenFailure(cause), { cause });
  }

  if (!token) {
    throw new PushSetupError('The notification service did not issue this browser a token.');
  }
  return token;
}

/**
 * Resolves once the registration has an active worker.
 *
 * `getToken` subscribes through the registration's push manager, and a push
 * manager refuses a worker that is still installing. Firebase waits for that when
 * it registers its own worker; handed one, as it is here, it does not. That is
 * every first attempt on every browser — which used to fail silently and flip the
 * switch back to off.
 */
function activated(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();

  const worker = registration.installing ?? registration.waiting;
  if (worker === null) return Promise.reject(new Error('No service worker to wait for.'));

  return new Promise((resolve, reject) => {
    const settle = (outcome: Error | null) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', onChange);
      if (outcome === null) resolve();
      else reject(outcome);
    };

    const onChange = () => {
      if (worker.state === 'activated') settle(null);
      else if (worker.state === 'redundant') {
        settle(new Error('Service worker was discarded while installing.'));
      }
    };

    const timer = setTimeout(
      () => settle(new Error(`Service worker not active after ${WORKER_TIMEOUT_MS}ms.`)),
      WORKER_TIMEOUT_MS,
    );
    worker.addEventListener('statechange', onChange);
  });
}

function describeTokenFailure(error: unknown): string {
  const { code, name } = (error ?? {}) as { code?: string; name?: string };

  if (code === 'messaging/permission-blocked' || code === 'messaging/permission-default') {
    return 'Notifications are blocked for this site in your browser settings.';
  }
  // The push manager's own refusals arrive as DOM exceptions, not Firebase errors.
  // Brave is the common case: it ships with Google's push service switched off.
  if (name === 'AbortError' || name === 'NotAllowedError') {
    return 'This browser’s push service is turned off or unreachable. In Brave, turn on “Use Google services for push messaging” in its privacy settings.';
  }
  if (code === 'messaging/token-subscribe-failed') {
    return 'The notification service refused to register this browser. Try again in a moment.';
  }
  return 'Notifications could not be turned on in this browser.';
}

async function saveToken(token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(DEVICES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  } catch (cause) {
    throw new PushSetupError('Could not reach the server. Check your connection and try again.', {
      cause,
    });
  }

  // Checked. It used not to be, so a device the server never stored still flipped
  // the switch on.
  if (response.status === 401) {
    throw new PushSetupError('Your session has ended. Sign in again to turn notifications on.');
  }
  if (!response.ok) {
    throw new PushSetupError(
      'Notifications could not be saved for this device. Try again in a moment.',
    );
  }
}

/**
 * This browser's current token, without creating one.
 *
 * Null when there is no worker or no subscription — `getToken` would otherwise
 * subscribe the browser in order to answer, which is the opposite of switching off.
 */
async function existingToken(): Promise<string | null> {
  const app = firebaseApp();
  if (app === null || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration || (await registration.pushManager.getSubscription()) === null) return null;
    return await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}

/** True when the server confirmed. The cookie covers a missing token. */
async function forgetDevice(token: string | null): Promise<boolean> {
  try {
    const response = await fetch(DEVICES_URL, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(token === null ? {} : { token }),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** For whoever opens the console. The person at the switch gets a sentence instead. */
function report(failure: unknown): void {
  const cause = failure instanceof PushSetupError ? (failure.cause ?? failure) : failure;
  console.warn('[novex] push notifications', cause);
}
