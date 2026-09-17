import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';
import { systemIdGenerator, type IdGenerator } from '@/shared/kernel/ids';

import type { SupportDependencies } from './application/ports';
import {
  createDecideConversation,
  type DecideConversation,
} from './application/use-cases/decide-conversation';
import { createPostMessage, type PostMessage } from './application/use-cases/post-message';
import { firebase } from './infrastructure/firestore/app';
import { FirebasePushSender } from './infrastructure/firestore/push';
import { FirebaseRealtimeAuth } from './infrastructure/firestore/realtime-auth';
import {
  FirestoreConversationRepository,
  FirestoreMessageRepository,
} from './infrastructure/firestore/repositories';
import { PostgresAttachmentStorage } from './infrastructure/persistence/attachments';

/**
 * Support module registration.
 *
 * ── Returns null when Firebase is not configured ───────────────────────────────
 * The same contract `ledger` and `presence` follow for a missing database: a clone
 * with no Firebase project runs, the widget and the console report themselves
 * unavailable, and nothing else on the platform notices. Throwing here would mean
 * a missing environment variable takes down the marketing site.
 */

export interface SupportModule {
  readonly postMessage: PostMessage;
  readonly decideConversation: DecideConversation;
  /** Passed to the module's queries, which are free functions over these ports. */
  readonly dependencies: SupportDependencies;
}

export interface RegisterSupportOptions {
  /**
   * Where attachment bytes go.
   *
   * The conversation is in Firestore and the images are here — see
   * `infrastructure/persistence/schema.ts` for why a module has two stores. Both
   * are required: chat without the ability to send a screenshot is not the feature
   * that was asked for, so a missing database disables support the same way a
   * missing Firebase project does.
   */
  db: Database;
  /** The site's name, which notifications are signed with. */
  siteName: string;
  ids?: IdGenerator;
  clock?: Clock;
}

export function registerSupport(options: RegisterSupportOptions): SupportModule | null {
  const handles = firebase();
  if (handles === null) return null;

  const dependencies: SupportDependencies = {
    conversations: new FirestoreConversationRepository(handles.firestore),
    messages: new FirestoreMessageRepository(handles.firestore),
    realtime: new FirebaseRealtimeAuth(handles.auth),
    push: new FirebasePushSender(handles.firestore, handles.messaging),
    attachments: new PostgresAttachmentStorage(options.db),
    ids: options.ids ?? systemIdGenerator,
    clock: options.clock ?? systemClock,
    siteName: options.siteName,
  };

  return {
    postMessage: createPostMessage(dependencies),
    decideConversation: createDecideConversation(dependencies),
    dependencies,
  };
}
