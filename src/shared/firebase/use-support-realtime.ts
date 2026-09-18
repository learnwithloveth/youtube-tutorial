'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
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

/**
 * `polling` is a real state, not a nicer word for broken.
 *
 * Messages still arrive; they arrive on a timer instead of instantly. Collapsing
 * it into `unavailable` would tell an operator the chat is down while it is
 * working, and hide the fact that the *listener* is the thing to fix.
 */
export type RealtimeStatus = 'connecting' | 'live' | 'polling' | 'unavailable';

/** How often the fallback asks. Fast enough for a conversation, see the route. */
const POLL_MS = 4_000;

/**
 * A listener that could not attach, and the sentence for whoever can fix it.
 *
 * ── Why this is not swallowed ─────────────────────────────────────────────────
 * Every `onSnapshot` here used to take an error callback that discarded the error
 * — `() => undefined`, or worse, one that set the thread to null. Signing in was
 * treated as proof that the listeners worked, so the header said "Connected"
 * while Firestore was refusing every read, and the polling fallback, which exists
 * for exactly this, never ran because the status was never `polling`.
 *
 * That is not hypothetical. The customer's transcript listener queried a
 * conversation's `messages` with no `userId` filter, which the rules cannot
 * satisfy for a customer — a query is refused unless every document it could
 * return is provably readable — so the widget was dead in the water for every
 * customer, silently, while the operator's console (whose rule does not look at
 * the document) worked fine.
 *
 * So a listener that fails now says so, and the hook drops to polling. Slower,
 * working, and the reason travels to the operator console's status line.
 */
function describeListenerFailure(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';

  if (code === 'permission-denied') {
    return 'Firestore refused the listener. The deployed security rules do not allow this read — run `pnpm firebase:deploy`.';
  }
  if (code === 'failed-precondition') {
    return 'This listener needs a Firestore index that does not exist yet — run `pnpm firebase:deploy`.';
  }
  if (code === 'unauthenticated') {
    return 'The Firestore session expired before the listener attached.';
  }
  return `The listener stopped${code ? ` (${code})` : ''}.`;
}

/**
 * Tracks whichever listener gave up first.
 *
 * One flag per hook rather than per listener: a screen with half its subscriptions
 * attached is wrong in the same way as one with none, and the fallback reads
 * everything anyway.
 */
function useListenerFailure(): {
  failure: string | null;
  onFailure: (error: unknown) => void;
} {
  const [failure, setFailure] = useState<string | null>(null);

  const onFailure = useCallback((error: unknown) => {
    // For whoever opens the console. Firestore's own message names the rule or the
    // index, and is worth more than anything this could paraphrase.
    console.warn('[novex] support listener', error);
    setFailure(describeListenerFailure(error));
  }, []);

  return { failure, onFailure };
}

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
function useFirebaseSession(enabled: boolean): { status: RealtimeStatus; reason: string | null } {
  const [state, setState] = useState<{ status: RealtimeStatus; reason: string | null }>({
    status: 'connecting',
    reason: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void signInToFirebase()
      .then((outcome) => {
        if (cancelled) return;
        setState(
          outcome.ok
            ? { status: 'live', reason: null }
            : // Not `unavailable`: the poller below takes over from here, and the
              // conversation keeps working. The reason travels with it so an
              // operator can see what to fix.
              { status: 'polling', reason: outcome.reason },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'polling', reason: 'Sign-in threw.' });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Derived, not stored. Writing 'unavailable' into state from inside the effect
  // would be a second render for something already known at render time — and the
  // effect would then have to undo it when `enabled` flips back.
  return enabled ? state : { status: 'unavailable', reason: null };
}

/**
 * Calls back on a timer while the tab is visible.
 *
 * Skipping a hidden tab entirely is what keeps a console left open in a background
 * window from costing anything — and on a per-document-billed database that is not
 * a micro-optimisation, it is the difference between a free tier that lasts a day
 * and one that lasts a month.
 */
function usePoll(active: boolean, tick: () => Promise<void>): void {
  // Held in a ref so a caller's changing closure does not restart the timer — which
  // would mean a request per render rather than one per interval. Written inside an
  // effect rather than during render: a ref mutated while rendering is the thing
  // React's compiler refuses, and correctly, because a render can be discarded.
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) return;

    let stopped = false;
    let timer: number | null = null;

    const run = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await latest.current();
        } catch {
          // A failed poll is the next poll's problem. Surfacing it would flash an
          // error on every dropped packet.
        }
      }
      if (!stopped) timer = window.setTimeout(run, POLL_MS);
    };

    void run();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [active]);
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
  reason: string | null;
} {
  const { status, reason } = useFirebaseSession(input.enabled);
  const { failure, onFailure } = useListenerFailure();
  // Signed in but refused: the conversation keeps working, on the timer below.
  const session = status === 'live' && failure !== null ? 'polling' : status;
  const [conversation, setConversation] = useState(input.initialConversation);
  const [messages, setMessages] = useState<readonly MessageDto[]>(input.initialMessages);

  /**
   * The fallback, used only when the listener could not attach.
   *
   * `since` is the newest message this client already holds, so an idle poll reads
   * one document and answers "nothing changed" — see the route. Without it, a
   * conversation open in two windows would burn a free tier's daily reads in an
   * afternoon of silence.
   */
  const newest = messages.at(-1)?.sentAt ?? null;
  const pollOnce = useCallback(async () => {
    const url = newest === null
      ? '/api/support/thread'
      : `/api/support/thread?since=${encodeURIComponent(newest)}`;

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return;

    const body = (await response.json()) as {
      changed: boolean;
      conversation?: ConversationDto | null;
      messages?: MessageDto[];
    };
    if (!body.changed) return;

    setConversation(body.conversation ?? null);
    setMessages(body.messages ?? []);
  }, [newest]);

  usePoll(input.enabled && session === 'polling', pollOnce);

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
      // Recorded, never rendered as "no thread". A rules rejection is a
      // configuration problem, and answering it with an empty conversation told
      // a customer their thread did not exist. The poller takes over from here.
      onFailure,
    );

    return unsubscribe;
  }, [session, input.userId, onFailure]);

  const conversationId = conversation?.id ?? null;

  useEffect(() => {
    if (session !== 'live' || conversationId === null) return;

    const db = firebaseDb();
    if (db === null) return;

    return onSnapshot(
      query(
        collection(db, 'conversations', conversationId, 'messages'),
        /*
         * Not redundant, even though every message in this subcollection belongs
         * to this conversation and therefore to this customer.
         *
         * Firestore does not filter a query by the security rules — it refuses
         * one it cannot prove is entirely readable. The customer's rule is
         * `request.auth.uid == resource.data.userId`, which it can only satisfy
         * if the query itself says so. Without this line the whole listener is
         * rejected with `permission-denied`, which is why `userId` is
         * denormalised onto every message document — see `firestore.rules`.
         *
         * The operator's listener below needs no such clause: `isOperator()`
         * never looks at the document, so any query satisfies it.
         */
        where('userId', '==', input.userId),
        orderBy('sentAt', 'asc'),
        limitTo(200),
      ),
      (snapshot) => setMessages(snapshot.docs.map(toMessage)),
      onFailure,
    );
  }, [session, conversationId, input.userId, onFailure]);

  return { conversation, messages, status: session, reason: reason ?? failure };
}

/** The operator's inbox: every conversation, newest activity first. */
export function useConversationInbox(input: {
  enabled: boolean;
  initial: readonly ConversationDto[];
}): {
  conversations: readonly ConversationDto[];
  status: RealtimeStatus;
  reason: string | null;
} {
  const { status, reason } = useFirebaseSession(input.enabled);
  const { failure, onFailure } = useListenerFailure();
  const session = status === 'live' && failure !== null ? 'polling' : status;
  const [conversations, setConversations] = useState(input.initial);

  // The whole list every time, because there is no cheap "what changed" for a
  // collection the way there is for one document. It is tens of rows and only runs
  // when the listener could not attach.
  const pollOnce = useCallback(async () => {
    const response = await fetch('/api/support/thread', { method: 'POST', cache: 'no-store' });
    if (!response.ok) return;

    const body = (await response.json()) as { conversations?: ConversationDto[] };
    if (body.conversations) setConversations(body.conversations);
  }, []);

  usePoll(input.enabled && session === 'polling', pollOnce);

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
      onFailure,
    );
  }, [session, onFailure]);

  return { conversations, status: session, reason: reason ?? failure };
}

/** One thread's transcript, for whichever conversation the operator has open. */
export function useConversationMessages(input: {
  enabled: boolean;
  conversationId: string | null;
  initial: readonly MessageDto[];
}): readonly MessageDto[] {
  const { status } = useFirebaseSession(input.enabled);
  const { failure, onFailure } = useListenerFailure();
  const session = status === 'live' && failure !== null ? 'polling' : status;

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
      onFailure,
    );
  }, [session, input.conversationId, onFailure]);

  const shown = loaded.conversationId === input.conversationId ? loaded.messages : [];

  // The fallback, conditional on the newest message already held — see the route.
  const newest = shown.at(-1)?.sentAt ?? null;
  const conversationId = input.conversationId;

  const pollOnce = useCallback(async () => {
    if (conversationId === null) return;

    const params = new URLSearchParams({ conversationId });
    if (newest !== null) params.set('since', newest);

    const response = await fetch(`/api/support/thread?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return;

    const body = (await response.json()) as { changed: boolean; messages?: MessageDto[] };
    if (!body.changed) return;

    setLoaded({ conversationId, messages: body.messages ?? [] });
  }, [conversationId, newest]);

  usePoll(input.enabled && session === 'polling' && conversationId !== null, pollOnce);

  return shown;
}
