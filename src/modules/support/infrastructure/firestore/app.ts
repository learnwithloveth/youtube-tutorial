import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import { firebaseServiceAccount } from '@/platform/env';

/**
 * The Firebase Admin app, initialised at most once.
 *
 * ── Named, and looked up by name ───────────────────────────────────────────────
 * `initializeApp` throws if called twice for the same name, and in development it
 * *will* be called twice: a hot reload re-evaluates the module while the previous
 * instance is still registered in the SDK's global registry. Giving the app a name
 * and checking for it first is what makes the second evaluation a no-op instead of
 * a crash loop that only happens after you edit a file.
 *
 * ── Admin credentials bypass security rules, and that is the design ────────────
 * Everything this application writes goes through here, so the rules never have to
 * express a write condition — they are read-only, and `src/server/auth.ts` remains
 * the single authority over who may do what. The rules are the second lock on the
 * browser's direct *read* channel, not a duplicate of the authorisation logic.
 */

const APP_NAME = 'novex-support';

let cached: App | null | undefined;

function supportApp(): App | null {
  if (cached !== undefined) return cached;

  const account = firebaseServiceAccount();
  if (account === null) {
    // A supported configuration, not a fault. A clone with no Firebase project
    // runs; the support screens report themselves unavailable and nothing else
    // on the platform notices.
    cached = null;
    return null;
  }

  const existing = getApps().find((app) => app.name === APP_NAME);
  cached = existing ?? initializeApp({ credential: cert(account) }, APP_NAME);
  return cached;
}

export interface FirebaseHandles {
  readonly firestore: Firestore;
  readonly auth: Auth;
  readonly messaging: Messaging;
  readonly projectId: string;
}

/** Null when no Firebase project is configured. Every caller degrades around it. */
export function firebase(): FirebaseHandles | null {
  const app = supportApp();
  if (app === null) return null;

  const firestore = getFirestore(app);
  return {
    firestore,
    auth: getAuth(app),
    messaging: getMessaging(app),
    projectId: app.options.projectId ?? '',
  };
}

/** The collections this module owns. Named in one place so a rename is one edit. */
export const COLLECTIONS = {
  conversations: 'conversations',
  /** A subcollection of a conversation, not a root collection — see the rules. */
  messages: 'messages',
  /** Push registrations, keyed by the FCM token itself. */
  devices: 'supportDevices',
} as const;
