/* =============================================================================
 * Push notification service worker.
 *
 * ── No Firebase SDK in here, on purpose ──────────────────────────────────────
 * The browser subscribes through Firebase — `getToken` in `use-push.ts` — and
 * messages travel through Firebase Cloud Messaging, but *receiving* one is the
 * plain Push API: a `push` event carrying the JSON the server sent.
 *
 * This file used to load Firebase's worker SDK from a CDN, and that SDK added one
 * behaviour of its own: whenever any tab of the site was visible, it handed the
 * message to that page instead of showing a notification. No page listened for
 * it. So anybody looking at the site when a message arrived — which, while testing
 * notifications, is everybody — got nothing at all.
 *
 * Handling the event directly also removes a CDN fetch at install, an SDK version
 * to keep in step with the app's, and the project config that had to be passed in
 * through this file's URL.
 *
 * ── Shown unless the screen already shows it ──────────────────────────────────
 * Every message becomes a system notification, in the foreground as much as the
 * background, with one exception: a message whose screen is focused and live. An
 * agent working the support queue, or a customer with the chat open, sees the
 * message arrive there; a notification on top of it is noise. The worker cannot
 * see a page's DOM, so it asks the focused tab — see `showsLive`.
 * ========================================================================== */

/** The screens a message can name as already showing it. Anything else is shown. */
const LIVE_SURFACES = ['support-queue', 'support-thread'];

/** How long a tab gets to answer before the notification is shown anyway. */
const ANSWER_TIMEOUT_MS = 400;

self.addEventListener('install', () => {
  // Nothing is cached here, so a new version has no reason to wait for every old
  // tab to close before it takes over.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(receive(event));
});

async function receive(event) {
  const message = readMessage(event);
  if (message === null) return;

  const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  // Every open tab hears about it, so a bell count or a list can update in place
  // instead of waiting for the next navigation.
  for (const tab of tabs) {
    tab.postMessage({ type: 'novex:push', surface: message.surface });
  }

  if (LIVE_SURFACES.includes(message.surface)) {
    for (const tab of tabs) {
      if (tab.focused && (await showsLive(tab, message.surface))) return;
    }
  }

  await self.registration.showNotification(message.title, {
    body: message.body,
    icon: '/favicon.ico',
    // A tag replaces an earlier notification with the same one: one per support
    // conversation, one per price alert. `renotify` keeps the replacement audible —
    // silently swapping the text is a message nobody notices — and is only allowed
    // alongside a tag.
    ...(message.tag ? { tag: message.tag, renotify: true } : {}),
    data: { link: message.link },
  });
}

/**
 * The payload, or null when this is not one of ours.
 *
 * FCM wraps what the server sent: `{ data: { title, body, link, … }, from, … }`.
 * The server only ever sends `data`; a `notification` block is read too, so a
 * message sent by hand from the Firebase console still shows as something.
 */
function readMessage(event) {
  if (!event.data) return null;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return null;
  }

  const data = (payload && payload.data) || {};
  const notification = (payload && payload.notification) || {};
  const title = data.title || notification.title;
  if (!title) return null;

  return {
    title,
    body: data.body || notification.body || '',
    link: data.link || '/',
    tag: data.tag || null,
    surface: data.surface || null,
  };
}

/**
 * Asks a tab whether it is showing this surface live right now.
 *
 * Over a `MessageChannel`, with a short deadline: a tab that never answers — a
 * page that does not listen, or one busy rendering — gets the notification rather
 * than silence. Missing a message is worse than seeing it twice.
 */
function showsLive(tab, surface) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), ANSWER_TIMEOUT_MS);

    channel.port1.onmessage = (answer) => {
      clearTimeout(timer);
      resolve(answer.data === true);
    };

    tab.postMessage({ type: 'novex:shows-live', surface }, [channel.port2]);
  });
}

/*
 * Clicking a notification focuses an existing tab rather than opening another.
 *
 * An operator working a queue ends the day with fifteen copies of the console
 * otherwise, and the one they were typing in is no longer the one in front.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(open((event.notification.data && event.notification.data.link) || '/'));
});

async function open(link) {
  // A path from the server, resolved against the site this worker belongs to — and
  // held to it, so a notification can only ever open this site.
  const resolved = new URL(link, self.location.origin);
  const href =
    resolved.origin === self.location.origin ? resolved.href : `${self.location.origin}/`;

  const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const tab = tabs.find((candidate) => candidate.url === href) || tabs[0];
  if (!tab) return self.clients.openWindow(href);

  // `navigate` is only allowed on a tab this worker controls, and one opened before
  // the worker was installed is not. Either failure opens the link in a new window
  // rather than leaving the click doing nothing.
  try {
    const focused = await tab.focus();
    if (focused.url === href) return focused;
    return await focused.navigate(href);
  } catch {
    return self.clients.openWindow(href);
  }
}
