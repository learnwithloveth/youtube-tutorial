/* =============================================================================
 * Firebase Cloud Messaging service worker.
 *
 * ── Why the config arrives in the query string ───────────────────────────────
 * This file is served straight from `public/`, so nothing substitutes environment
 * variables into it at build time. The registration in `use-push.ts` therefore
 * passes the project's config as search params and this reads them back.
 *
 * That is a documented FCM pattern, not a workaround, and it is what lets one
 * committed file serve development and production without a hardcoded project id.
 * Everything passed this way is public by design — see `shared/firebase/client.ts`.
 *
 * ── The compat SDK, deliberately ─────────────────────────────────────────────
 * A service worker cannot import from `node_modules`; it gets `importScripts` and
 * a URL. The compat builds on gstatic are the only Firebase distribution shaped
 * for that, and pinning an exact version keeps a silent upstream change from
 * breaking notifications with no deploy of ours behind it.
 * ========================================================================== */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;

const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  appId: params.get('appId'),
  messagingSenderId: params.get('messagingSenderId'),
};

if (config.apiKey && config.projectId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  /*
   * Background messages.
   *
   * The server sends a `data`-only payload with no `notification` block, which is
   * what puts this handler in charge of what appears. With a notification block the
   * browser draws its own alert *and* this fires — which is how one message becomes
   * two notifications on the screen.
   */
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};

    self.registration.showNotification(data.title || 'Novex', {
      body: data.body || '',
      icon: '/favicon.ico',
      /*
       * Tagged by conversation, so a customer sending four messages replaces one
       * notification rather than stacking four. `renotify` keeps the replacement
       * audible — silently swapping the text is a message nobody notices.
       */
      tag: data.conversationId ? `support-${data.conversationId}` : 'support',
      renotify: true,
      data: { link: data.link || '/' },
    });
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

  const link = (event.notification.data && event.notification.data.link) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
