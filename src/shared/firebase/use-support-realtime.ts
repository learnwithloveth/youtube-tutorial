'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';

import type { ConversationDto, MessageDto } from '@/modules/support';

import { firebaseDb, signInToFirebase } from './client';

/**
 * Firestore listeners for live support.
 *
 * ── The server renders first; this takes over ──────────────────────────────────
 * Every hook here starts from data the page already rendered on the server, so the
 * screen is correct before any of this runs. Without that, opening the console
 * means watching an empty panel through a bundle parse, an auth round trip and a
 * first snapshot — on the one screen that is supposed to feel immediate.
 *
 * ── Why a listener and not a poll ──────────────────────────────────────────────
 * Presence and the transaction feed both poll, and that is right for them: a
 * heartbeat cannot arrive faster than it is sent, and a ledger history does not
 * change while you read it. A conversation does. Somebody is waiting for the reply
 * and both people can see whether it landed, which is the one case in this
 * application where the difference between one second and ten is the product.
 *
 * ── `connected` is reported, never assumed ─────────────────────────────────────
 * A listener that silently stops is worse than no listener, because the screen
 * keeps looking live. Every hook exposes whether the subscription is actually
 * attached, and the UI says so.
 */

export type RealtimeStatus = 'connecting' | 'live' | 'unavailable';

/** Firestore hands back `Timestamp`; the DTOs this app passes around use ISO strings. */
function isoOf(value: unknown, fallback: string): string {
  const timestamp = value as Timestamp | undefined;
  return typeof timestamp?.toDate === 'function' ? timestamp.toDate().toISOString() : fallback;
}

function toConversation(document: QueryDocumentSnapshot<DocumentData>): ConversationDto {
  const data = document.data();
  const now = new Date(0).toISOString();
  return {
    id: document.id,
    userId: String(data.userId ?? ''),
    subject: String(data.subject ?? ''),
    status: data.status === 'resolved' ? 'resolved' : 'open',
    priority: data.priority ?? 'normal',
    assignedTo: (data.assignedTo as string | null) ?? null,
    openedAt: isoOf(data.openedAt, now),
    lastMessageAt: isoOf(data.lastMessageAt, now),
    lastMessagePreview: String(data.lastMessagePreview ?? ''),
    lastMessageAuthor: data.lastMessageAuthor ?? 'system',
    unreadForOperator: Number(data.unreadForOperator ?? 0),
    unreadForCustomer: Number(data.unreadForCustomer ?? 0),
    resolvedAt: data.resolvedAt ? isoOf(data.resolvedAt, now) : null,
  };
}

function toMessage(document: QueryDocumentSnapshot<DocumentData>): MessageDto {
  const data = document.data();
  return {
    id: document.id,
    conversationId: String(data.conversationId ?? ''),
    author: data.author ?? 'system',
    authorId: (data.authorId as string | null) ?? null,
    body: String(data.body ?? ''),
    attachmentId: (data.attachmentId as string | null) ?? null,
    sentAt: isoOf(data.sentAt, new Date(0).toISOString()),
  };
}

/**
 * Signs in once per mount and reports whether it worked.
 *
 * Shared by the hooks below rather than repeated, because doing it twice on one
 * page races two sign-ins and the loser's listeners are torn down mid-snapshot.
 */
function useFirebaseSession(enabled: boolean): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void signInToFirebase()
      .then((ok) => {
        if (!cancelled) setStatus(ok ? 'live' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Derived, not stored. Writing 'unavailable' into state from inside the effect
  // would be a second render for something already known at render time — and the
  // effect would then have to undo it when `enabled` flips back.
  return enabled ? status : 'unavailable';
}

/**
 * The signed-in customer's own thread.
 *
 * Subscribes to their newest conversation rather than to a known id, so a widget
 * opened before the first message is sent picks the thread up the moment it is
 * created — with no second request and no reload.
 *
 * A resolved thread is still returned. The customer should see what was said and
 * be able to reply, which reopens it.
 */
export function useOwnConversation(input: {
  enabled: boolean;
  userId: string;
  initialConversation: ConversationDto | null;
  initialMessages: readonly MessageDto[];
}): {
  conversation: ConversationDto | null;
  messages: readonly MessageDto[];
  status: RealtimeStatus;
} {
  const session = useFirebaseSession(input.enabled);
  const [conversation, setConversation] = useState(input.initialConversation);
  const [messages, setMessages] = useState<readonly MessageDto[]>(input.initialMessages);

  useEffect(() => {
    if (session !== 'live') return;

    const db = firebaseDb();
    if (db === null) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'conversations'),
        where('userId', '==', input.userId),
        orderBy('lastMessageAt', 'desc'),
        limitTo(1),
      ),
      (snapshot) => {
        const document = snapshot.docs[0];
        setConversation(document === undefined ? null : toConversation(document));
      },
      // Swallowed to a null thread rather than thrown: a rules rejection here is a
      // configuration problem, and it must not take down the page around it.
      () => setConversation(null),
    );

    return unsubscribe;
  }, [session, input.userId]);

  const conversationId = conversation?.id ?? null;

  useEffect(() => {
    if (session !== 'live' || conversationId === null) return;

    const db = firebaseDb();
    if (db === null) return;

    return onSnapshot(
      query(
        collection(db, 'conversations', conversationId, 'messages'),
        orderBy('sentAt', 'asc'),
        limitTo(200),
      ),
      (snapshot) => setMessages(snapshot.docs.map(toMessage)),
      () => undefined,
    );
  }, [session, conversationId]);

  return { conversation, messages, status: session };
}

/** The operator's inbox: every conversation, newest activity first. */
export function useConversationInbox(input: {
  enabled: boolean;
  initial: readonly ConversationDto[];
}): { conversations: readonly ConversationDto[]; status: RealtimeStatus } {
  const session = useFirebaseSession(input.enabled);
  const [conversations, setConversations] = useState(input.initial);

  useEffect(() => {
    if (session !== 'live') return;

    const db = firebaseDb();
    if (db === null) return;

    // Unfiltered, ordered by recency. The console's Open/Mine/All filters run over
    // this in memory: an inbox is tens of rows, and three separate queries would be
    // three listeners and three composite indexes to keep a tab switch instant.
    return onSnapshot(
      query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'), limitTo(50)),
      (snapshot) => setConversations(snapshot.docs.map(toConversation)),
      () => undefined,
    );
  }, [session]);

  return { conversations, status: session };
}

/** One thread's transcript, for whichever conversation the operator has open. */
export function useConversationMessages(input: {
  enabled: boolean;
  conversationId: string | null;
  initial: readonly MessageDto[];
}): readonly MessageDto[] {
  const session = useFirebaseSession(input.enabled);

  /**
   * The transcript, tagged with the thread it belongs to.
   *
   * One piece of state rather than two, because the pair has to change together:
   * selecting a second conversation must not show the first one's messages while
   * the new snapshot is in flight. Tagging makes that a render-time comparison
   * instead of an effect that clears the list a beat too late.
   */
  const [loaded, setLoaded] = useState<{
    conversationId: string | null;
    messages: readonly MessageDto[];
  }>({ conversationId: input.conversationId, messages: input.initial });

  useEffect(() => {
    if (session !== 'live' || input.conversationId === null) return;

    const db = firebaseDb();
    if (db === null) return;

    return onSnapshot(
      query(
        collection(db, 'conversations', input.conversationId, 'messages'),
        orderBy('sentAt', 'asc'),
        limitTo(200),
      ),
      (snapshot) =>
        setLoaded({
          conversationId: input.conversationId,
          messages: snapshot.docs.map(toMessage),
        }),
      () => undefined,
    );
  }, [session, input.conversationId]);

  return loaded.conversationId === input.conversationId ? loaded.messages : [];
}

/** Kept for callers that only need a document reference, e.g. an optimistic read. */
export function conversationRef(conversationId: string) {
  const db = firebaseDb();
  return db === null ? null : doc(db, 'conversations', conversationId);
}
