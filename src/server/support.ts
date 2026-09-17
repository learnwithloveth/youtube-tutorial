import 'server-only';

import { cache } from 'react';

import type { UserSummaryDto } from '@/modules/identity';
import type { ConversationDto, ConversationStatus } from '@/modules/support';
import {
  countOpenConversations,
  getOwnThread,
  getThread,
  listConversations,
  registerSupport,
  type SupportModule,
} from '@/modules/support/server';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { identity } from './auth';
import { getLiveActivity } from './presence';

/**
 * The application's facade over live support.
 *
 * ── Three contexts, joined here and nowhere else ───────────────────────────────
 * A conversation lives in Firestore and knows only an opaque `UserId`. Who that is
 * comes from identity, in Postgres. Whether they are on the site right now, and
 * what page they are reading while they wait, comes from presence — also Postgres,
 * and already running.
 *
 * None of the three can answer for the others, and none of them should be able to:
 * that the support context holds an id rather than an email is what lets the chat
 * move to a different backend without touching identity, which is exactly what
 * happened when it moved *to* Firestore.
 *
 * So the join is here, above all three, which is the same arrangement `users.ts`
 * and `transactions.ts` use.
 *
 * ── Presence is reused, not rebuilt ────────────────────────────────────────────
 * Firebase has a presence story, and using it would have meant a second answer to
 * "is this person online" that disagreed with the live board. The heartbeat this
 * reads is the one already keeping `/admin/live` and the account map current.
 */

export const support = cache((): SupportModule | null => {
  // Both stores or nothing. Conversations need Firebase and attachments need
  // Postgres, and a half-configured chat that accepts a message and refuses an
  // image is worse than one that says it is unavailable.
  const handle = db();
  if (handle === null) return null;

  return registerSupport({ db: handle });
});

/** What the console knows about the customer behind a conversation. */
export interface SupportCustomerDto {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  /** Null when they are not on the site. */
  readonly live: {
    readonly path: string;
    readonly activity: 'active' | 'idle';
    readonly city: string | null;
    readonly country: string | null;
  } | null;
}

export interface SupportInboxDto {
  readonly conversations: readonly ConversationDto[];
  /** Keyed by `UserId`. Missing for an account the directory could not resolve. */
  readonly customers: Readonly<Record<string, SupportCustomerDto>>;
  readonly degraded: boolean;
  /** False when no Firebase project is configured — a state, not a failure. */
  readonly configured: boolean;
}

const UNCONFIGURED: SupportInboxDto = {
  conversations: [],
  customers: {},
  degraded: false,
  configured: false,
};

export async function getSupportInbox(
  options: { status?: ConversationStatus | undefined; assignedTo?: UserId | undefined } = {},
): Promise<SupportInboxDto> {
  const context = support();
  if (context === null) return UNCONFIGURED;

  const list = await listConversations(context.dependencies, options);
  if (list.conversations.length === 0) {
    return { ...list, customers: {}, configured: true };
  }

  return {
    ...list,
    customers: await describeSupportCustomers(list.conversations.map((c) => c.userId)),
    configured: true,
  };
}

/** One thread with its transcript, for the server's first paint. */
export async function getSupportThread(conversationId: string, asCustomer?: UserId) {
  const context = support();
  if (context === null) return { conversation: null, messages: [], degraded: false };

  return getThread(context.dependencies, conversationId, asCustomer);
}

/** The signed-in customer's own thread, for the widget's first paint. */
export async function getMySupportThread(userId: UserId) {
  const context = support();
  if (context === null) return { conversation: null, messages: [], degraded: false };

  return getOwnThread(context.dependencies, userId);
}

/**
 * Open conversations, for the console's rail badge.
 *
 * Deduplicated per request and counted rather than listed, because the layout runs
 * it on every admin page.
 */
export const getOpenSupportCount = cache(async (): Promise<number> => {
  const context = support();
  if (context === null) return 0;

  return countOpenConversations(context.dependencies);
});

/**
 * Who these conversations belong to, and where they are right now.
 *
 * Exported because the console re-asks as it runs: Firestore pushes a conversation
 * from somebody the first render had never heard of, and the customer's *presence*
 * — online, and on which page — goes stale within a minute of being read. Both are
 * answered by the same join, so there is one function rather than two that drift.
 *
 * Never throws and never fails the inbox. A conversation whose owner cannot be
 * looked up still has to render — an operator needs to answer the question in
 * front of them even when the directory is the thing that is down, and the id is
 * on the row either way.
 */
export async function describeSupportCustomers(
  ids: readonly string[],
): Promise<Record<string, SupportCustomerDto>> {
  const unique = [...new Set(ids)].flatMap((id) => {
    try {
      return [toUserId(id)];
    } catch {
      return [];
    }
  }) as UserId[];

  if (unique.length === 0) return {};

  // `allSettled`, not `all`: two independent reads, and the directory being down
  // should cost the email rather than the whole inbox. `all` would also leave the
  // second rejection unattached, which Node terminates the process for.
  const [accounts, live] = await Promise.allSettled([
    identity().describeUsers(unique),
    getLiveActivity({ limit: 200 }),
  ]);

  if (accounts.status === 'rejected') {
    logger.warn({ event: 'support_directory_failed', module: 'identity' }, accounts.reason);
    return {};
  }

  // One visitor per account, newest first — a customer with three tabs open is one
  // person, and the page they are on is the one they looked at most recently.
  const presence = new Map<string, SupportCustomerDto['live']>();
  if (live.status === 'fulfilled') {
    for (const visitor of live.value.visitors) {
      if (visitor.userId === null || presence.has(visitor.userId)) continue;
      presence.set(visitor.userId, {
        path: visitor.path,
        activity: visitor.activity,
        city: visitor.location?.city ?? null,
        country: visitor.location?.country ?? null,
      });
    }
  }

  return Object.fromEntries(
    [...accounts.value.values()].map((user: UserSummaryDto) => [
      user.id,
      {
        id: user.id,
        email: user.email,
        status: user.status,
        live: presence.get(user.id) ?? null,
      },
    ]),
  );
}
