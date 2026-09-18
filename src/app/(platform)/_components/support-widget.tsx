'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Headset,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';

import { BRAND } from '@/modules/content';
import type { ConversationDto, MessageDto } from '@/modules/support';
import { useOwnConversation } from '@/shared/firebase/use-support-realtime';
import { cn } from '@/shared/lib/cn';
import { useEscape, useScrollLock } from '@/shared/lib/hooks';
import { ChatComposer, type ComposerAttachment } from '@/shared/ui/chat/chat-composer';
import { useAttachment } from '@/shared/ui/chat/use-attachment';

import { CHAT_WALLPAPER, dayLabelFor, utcDayKey } from './chat-surface';

/**
 * The customer's chat with support.
 *
 * ── Built to WhatsApp's conventions, in this product's palette ─────────────────
 * The shapes and the behaviour are borrowed on purpose: a patterned ground, bubbles
 * with a clipped corner on the sender's side, the timestamp tucked inside the
 * bubble, day separators, and delivery ticks. Those are not decoration — they are
 * the conventions a billion people already have in their hands, and matching them
 * means nobody has to learn this.
 *
 * The composer is `ChatComposer`, shared with the operator's console so the two
 * cannot drift apart again — they already had, and an agent could not answer a
 * screenshot with a screenshot.
 *
 * The colours are not borrowed: the bubbles take this product's own tokens. A
 * WhatsApp clone in WhatsApp's colours reads as a third-party embed, which is the
 * opposite of what a support widget should look like.
 *
 * ── It sends through this application, and reads from Firestore ────────────────
 * Two different paths on purpose. The send is a POST to a route that holds the
 * session and writes with admin credentials, so the rule about who may say what
 * lives in one place. The read is a Firestore listener, because that is the socket
 * a serverless deployment cannot hold, and a reply appearing a second after it is
 * typed is the entire product here.
 *
 * ── No subject field ───────────────────────────────────────────────────────────
 * A box and a send button. Anything between somebody with a problem and the place
 * they type it is a step that converts a question into an abandoned session, and
 * the first line of what they wrote is a better summary than most people would put
 * in a "Subject" input. The thread names itself — see `subjectFrom`.
 */

const OPTIMISTIC_PREFIX = 'pending:';

/**
 * How much room the chat is taking.
 *
 * ── Three states, because they answer three different questions ───────────────
 *  - `normal`  — the docked panel. The default, and what most conversations want.
 *  - `full`    — the whole viewport. A long transcript, a screenshot somebody is
 *                reading, or a phone, where a 23rem panel over a page nobody is
 *                looking at is wasted screen.
 *  - `collapsed` — the title bar alone, still docked. "Not now, but do not put it
 *                away": the conversation stays open, the connection stays up, and
 *                the unread count stays where it can be seen.
 *
 * Closing to the bubble is the fourth, and it already existed.
 */
type ChatWindow = 'normal' | 'full' | 'collapsed';

/**
 * The preferred size, remembered per browser.
 *
 * Only `normal` and `full` are kept. Collapsing is a gesture about this moment,
 * not a preference — reopening tomorrow into a title bar with no visible reason
 * would read as the chat being broken.
 */
const WINDOW_KEY = 'novex.support.window';

/**
 * How far the server's clock may sit behind this browser's and still count as
 * "after". Only used to tell a fresh echo from an identical older message.
 */
const CLOCK_SKEW_MS = 2 * 60_000;

export function SupportWidget({
  userId,
  initialConversation,
  initialMessages,
}: {
  userId: string;
  initialConversation: ConversationDto | null;
  initialMessages: readonly MessageDto[];
}) {
  const [open, setOpen] = useState(false);
  const [windowMode, setWindowMode] = useState<ChatWindow>('normal');
  const [draft, setDraft] = useState('');
  /** How many sends are in flight. A count, because more than one can be. */
  const [inFlight, setInFlight] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Messages posted but not yet echoed back by the listener.
   *
   * Without these, pressing Enter clears the box and nothing appears until
   * Firestore's round trip completes — which on a slow connection reads as a lost
   * message and produces a second copy of it.
   */
  const [pending, setPending] = useState<MessageDto[]>([]);
  /** Optimistic ids whose POST came back refused. Shown as not sent, not pending. */
  const [undelivered, setUndelivered] = useState<readonly string[]>([]);

  /**
   * Sends, queued behind one another.
   *
   * ── Why a queue and not a busy flag ───────────────────────────────────────────
   * There was a busy flag, and `send` returned early while it was raised. Posting
   * a message is not fast — it writes the message, folds it into the thread's
   * summary and pushes a notification, which against a Firestore in another
   * region measured between four and twelve seconds from here. For that whole
   * window, every Enter did nothing at all: no bubble, no error, the text still
   * sitting in the box. The send button showed it was busy; the Enter key, which
   * is how people actually send, went through the disabled button and returned.
   *
   * So a second message typed during the first one's round trip was simply lost,
   * and the obvious thing to do about a chat that has swallowed what you typed is
   * to reload the page — where the first message, which did send, is waiting.
   * That is the "I have to refresh to see my message" this fixes.
   *
   * Serialised rather than parallel, because a conversation is ordered: two posts
   * in flight at once can be written in either order, and the transcript would
   * show the reply before the question.
   */
  const queue = useRef<Promise<void>>(Promise.resolve());

  /**
   * The live values `send` needs when its turn comes round, rather than the ones
   * that existed when Enter was pressed — a queued send may start ten seconds
   * later, by which time the thread exists and the box holds something else.
   */
  const conversationId = useRef<string | null>(initialConversation?.id ?? null);
  const draftRef = useRef('');

  const { attachment, setAttachment, uploading, error: uploadError, attach } = useAttachment();
  const threadRef = useRef<HTMLDivElement>(null);

  const { conversation, messages, status } = useOwnConversation({
    // No listener until the panel is opened. A customer who never contacts support
    // should not be paying for a Firestore connection on every page of the app.
    enabled: open,
    userId,
    initialConversation,
    initialMessages,
  });

  const shown = useMemo(() => {
    /*
     * An optimistic bubble stops being drawn once the transcript is carrying it.
     *
     * ── Two ways to know that, because one is not enough ──────────────────────
     * By id, once the POST answers and the copy on screen has adopted the id the
     * server gave it. That is exact — but it is also the *slow* half, because the
     * POST does not answer until the message, the thread summary and the push are
     * all written, and the Firestore listener has usually delivered the message
     * seconds before that. For those seconds the same message is on screen twice.
     *
     * So also by content, against messages the transcript did not have when this
     * one was typed. Each confirmed message is consumed by at most one optimistic
     * copy, so saying "ok" twice needs two echoes to clear two bubbles.
     *
     * Matching on body alone was the original rule and it was wrong the other way:
     * an "ok" already in the transcript from an hour ago swallowed the new one
     * before it could be drawn. `sentAt` is what separates the two cases.
     */
    const byId = new Set(messages.map((message) => message.id));
    const claimed = new Set<number>();

    const unconfirmed = pending.filter((optimistic) => {
      if (byId.has(optimistic.id)) return false;

      const echo = messages.findIndex(
        (message, index) =>
          !claimed.has(index) &&
          message.author === 'customer' &&
          message.body === optimistic.body &&
          (message.attachmentId ?? null) === (optimistic.attachmentId ?? null) &&
          // Not an older identical message. The allowance is for a client clock
          // that disagrees with the server's; when it is wider than that, the id
          // check above still clears the bubble a moment later.
          Date.parse(message.sentAt) >= Date.parse(optimistic.sentAt) - CLOCK_SKEW_MS,
      );

      if (echo === -1) return true;
      claimed.add(echo);
      return false;
    });

    return [...messages, ...unconfirmed];
  }, [messages, pending]);

  /**
   * How many of this customer's own messages the agent has already opened.
   *
   * Real, not decorative. `unreadForOperator` counts exactly the customer messages
   * nobody has read, so the last N of them are unread and everything before is
   * read. That gives the two ticks their actual meaning, instead of a checkmark
   * that always says the same thing.
   */
  const unreadFromMe = conversation?.unreadForOperator ?? 0;
  const readBoundary = useMemo(
    () => shown.filter((message) => message.author === 'customer').length - unreadFromMe,
    [shown, unreadFromMe],
  );

  const collapsed = windowMode === 'collapsed';
  const full = windowMode === 'full';

  // Restored after mount, never in an initialiser: the server has no storage, and a
  // guess would render one size on each side and fail hydration. Same shape as the
  // console rail's `restored` flag.
  const [restored, setRestored] = useState(false);
  if (!restored && typeof window !== 'undefined') {
    setRestored(true);
    try {
      if (window.localStorage.getItem(WINDOW_KEY) === 'full') setWindowMode('full');
    } catch {
      /* storage refused — the default stands */
    }
  }

  const remember = useCallback((next: ChatWindow) => {
    setWindowMode(next);
    if (next === 'collapsed') return;
    try {
      window.localStorage.setItem(WINDOW_KEY, next);
    } catch {
      /* non-fatal: the size is right for this visit either way */
    }
  }, []);

  // The whole viewport means the page behind it must not scroll under the finger.
  useScrollLock(open && full);

  /*
   * And the page's reserved scrollbar goes with it.
   *
   * `useScrollLock` locks `body`, but the scrollbar belongs to the document
   * element — and `base.css` reserves its width permanently with
   * `scrollbar-gutter: stable`, which is right for the site: a page that grows
   * past the viewport does not shift sideways when the scrollbar appears.
   *
   * A fixed `inset-0` element is laid out inside the viewport *minus* that
   * reserved gutter, so "full screen" left an eleven-pixel strip of page down the
   * right-hand edge. Hiding the overflow is not enough — a stable gutter is
   * reserved whether or not anything scrolls — so the reservation is lifted too,
   * for exactly as long as the chat is covering the screen. Both are put back on
   * the way out, and neither shift is visible: the chat is over all of it.
   */
  useEffect(() => {
    if (!open || !full) return;

    const root = document.documentElement;
    const previous = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    root.style.overflow = 'hidden';
    root.style.scrollbarGutter = 'auto';

    return () => {
      root.style.overflow = previous.overflow;
      root.style.scrollbarGutter = previous.gutter;
    };
  }, [open, full]);
  // Escape steps out of full screen rather than closing: somebody who has just
  // expanded the chat and hits Escape wants the page back, not the conversation
  // put away. Nothing is bound in the docked sizes, where Escape belongs to the page.
  useEscape(() => remember('normal'), open && full);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
    // `windowMode` is in here because expanding or collapsing changes the height of
    // the scroller, and a thread that reopens part-way up is a thread that looks
    // like it lost the last message.
  }, [shown.length, open, windowMode]);

  // Kept current for the queued sends above, in effects rather than during render:
  // a ref written while rendering is what React's compiler refuses, and rightly.
  useEffect(() => {
    if (conversation !== null) conversationId.current = conversation.id;
  }, [conversation]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  /**
   * A send the server would not take.
   *
   * The text goes back in the box when the box is free, along with the image —
   * somebody typed the one and chose the other, and the upload is still stored and
   * still unclaimed. When it is not free, because a queued message is sitting
   * there, the bubble stays on screen marked as not sent instead: overwriting what
   * somebody has just typed to hand back what they typed a minute ago loses one to
   * save the other.
   */
  const refuse = useCallback(
    (
      optimistic: MessageDto,
      body: string,
      sentAttachment: ComposerAttachment | null,
      problem: string,
    ) => {
      setFailed(problem);

      if (draftRef.current.length > 0) {
        setUndelivered((ids) => [...ids, optimistic.id]);
        return;
      }

      setDraft(body);
      setAttachment(sentAttachment);
      setPending((queued) => queued.filter((message) => message.id !== optimistic.id));
    },
    [setAttachment],
  );

  const deliver = useCallback(
    async (
      optimistic: MessageDto,
      body: string,
      sentAttachment: ComposerAttachment | null,
    ) => {
      try {
        const response = await fetch('/api/support/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            body,
            // Read now rather than when Enter was pressed: the first message of a
            // thread creates it, and the second — queued behind it — belongs in
            // the same one. Still optional; with no id the server finds the
            // customer's open thread, which is the same answer.
            ...(conversationId.current !== null
              ? { conversationId: conversationId.current }
              : {}),
            ...(sentAttachment !== null ? { attachmentId: sentAttachment.id } : {}),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          refuse(
            optimistic,
            body,
            sentAttachment,
            payload.error ?? 'That did not send. Try again.',
          );
          return;
        }

        // The id the server gave it, adopted by the copy already on screen. That
        // is what lets the listener's echo replace this bubble instead of
        // appearing beside it, and it turns the pending tick into a sent one
        // without waiting for the round trip back through Firestore.
        const created = (await response.json().catch(() => null)) as {
          conversation?: { id?: unknown };
          message?: { id?: unknown; conversationId?: unknown };
        } | null;
        const confirmedId = typeof created?.message?.id === 'string' ? created.message.id : null;
        if (typeof created?.conversation?.id === 'string') {
          conversationId.current = created.conversation.id;
        }

        setPending((queued) =>
          queued.flatMap((message) => {
            if (message.id !== optimistic.id) return [message];
            // No id to adopt — a 201 whose body would not parse. Dropping the copy
            // is right: the message is written, and the listener or the poller is
            // about to deliver the real one.
            if (confirmedId === null) return [];
            return [
              {
                ...message,
                id: confirmedId,
                conversationId:
                  typeof created?.message?.conversationId === 'string'
                    ? created.message.conversationId
                    : message.conversationId,
              },
            ];
          }),
        );
      } catch {
        refuse(
          optimistic,
          body,
          sentAttachment,
          'That did not send. Check your connection and try again.',
        );
      }
    },
    [refuse],
  );

  const send = useCallback(() => {
    const body = draft.trim();
    // An image on its own is a message: somebody who screenshots the error has said
    // something, and demanding a caption would be a field between them and the point.
    if (body.length === 0 && attachment === null) return;

    const optimistic: MessageDto = {
      id: `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: conversationId.current ?? '',
      author: 'customer',
      authorId: userId,
      body,
      attachmentId: attachment?.id ?? null,
      sentAt: new Date().toISOString(),
    };

    const sentAttachment = attachment;
    // The box is emptied and the bubble drawn on the keystroke, whatever the
    // network is doing. Nothing below this waits for a round trip.
    setDraft('');
    setAttachment(null);
    setPending((queued) => [...queued, optimistic]);
    setInFlight((count) => count + 1);
    setFailed(null);

    queue.current = queue.current
      .then(() => deliver(optimistic, body, sentAttachment))
      .finally(() => setInFlight((count) => count - 1));
  }, [draft, userId, attachment, setAttachment, deliver]);

  const unread = conversation?.unreadForCustomer ?? 0;
  // Either source, one line. A rejected upload and a failed send are the same
  // problem from where the customer is sitting.
  const problem = failed ?? uploadError;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          // Never back into a title bar: collapsing was about the moment it
          // happened, and the moment ended when this was pressed.
          if (collapsed) setWindowMode('normal');
          setOpen(true);
        }}
        /*
         * Clears the mobile tab bar, which is fixed to the bottom until `lg` and
         * was covering this button on every phone and tablet width. The safe-area
         * inset is added on top, for the home indicator on a modern iPhone.
         */
        className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-40 inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-4 py-3 text-sm font-medium text-fg shadow-float transition-colors hover:border-brand-soft lg:bottom-5"
      >
        <Headset className="size-4 text-brand-soft" />
        Support
        {unread > 0 ? (
          <span className="grid size-5 place-items-center rounded-full bg-brand text-2xs font-semibold text-on-brand">
            {unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div
      /*
       * The open thread, updating itself: a reply is not also announced by the
       * operating system while it is arriving here. Only while live — polling
       * shows a reply seconds late, and the notification is how they hear sooner.
       *
       * And only while the transcript is actually on screen. Collapsed, the chat is
       * a title bar: the reply is not being read, so suppressing the notification
       * would be the one case where somebody is told nothing at all.
       */
      data-live-surface={status === 'live' && !collapsed ? 'support-thread' : undefined}
      className={cn(
        'fixed flex flex-col overflow-hidden border border-line bg-bg-elev shadow-float',
        full
          ? // Edge to edge, and above the mobile tab bar, which is also `z-40` and
            // would otherwise sit on top of a chat covering the whole screen. No
            // rounding: a sliver of page around the outside reads as a dialog that
            // has been placed wrong rather than a window filling the screen.
            'inset-0 z-50 rounded-none'
          : cn(
              // Same clearance as the button, and a height that accounts for it —
              // the panel was measured against the full viewport and ran under the
              // mobile tab bar.
              'z-40 right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] w-[min(23rem,calc(100vw-2.5rem))] rounded-xl lg:bottom-5',
              collapsed
                ? // The header's own height, whatever that turns out to be.
                  'h-auto'
                : 'h-[34rem] max-h-[calc(100dvh-9rem)] lg:max-h-[calc(100dvh-2.5rem)]',
            ),
      )}
    >
      <header
        className={cn(
          'flex shrink-0 items-center gap-3 bg-surface px-3 py-2.5',
          !collapsed && 'border-b border-line',
        )}
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-soft"
        >
          <Headset className="size-4" />
        </span>
        <button
          type="button"
          // The whole title is the way back up, the way every chat dock behaves.
          // Inert when the transcript is already showing, so it never steals a
          // click meant for the text behind it.
          onClick={collapsed ? () => remember('normal') : undefined}
          disabled={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-fg">
                {BRAND.name} Support
              </span>
              {collapsed && unread > 0 ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-2xs font-semibold text-on-brand">
                  {unread}
                </span>
              ) : null}
            </span>

            {/* Where WhatsApp shows "online". Ours reports the connection, because
                that is what this application actually knows — nothing here tracks
                whether an agent is at their desk. */}
            <span className="flex items-center gap-1.5 truncate text-2xs text-fg-subtle">
              {/* A customer is never told about a Firebase setting. Polling is a
                  working conversation on a timer, so it says so plainly and nothing
                  more — the specifics belong on the operator's screen. */}
              {status === 'live' ? (
                <>
                  <span aria-hidden className="size-1.5 rounded-full bg-up" />
                  Connected
                </>
              ) : status === 'connecting' ? (
                'Connecting…'
              ) : status === 'polling' ? (
                <>
                  <span aria-hidden className="size-1.5 rounded-full bg-warn" />
                  Checking for replies
                </>
              ) : (
                'Offline — messages still send'
              )}
            </span>
          </span>
        </button>

        {/*
          Collapse, resize, put away.

          Three controls rather than one, because they are three different wants:
          keep it open but out of the way, give it the whole screen, or be done with
          it. Each keeps the conversation — nothing here ends a thread.
        */}
        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderButton
            label={collapsed ? 'Expand the chat' : 'Collapse the chat'}
            onClick={() => remember(collapsed ? 'normal' : 'collapsed')}
          >
            {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </HeaderButton>

          <HeaderButton
            label={full ? 'Leave full screen' : 'Full screen'}
            onClick={() => remember(full ? 'normal' : 'full')}
          >
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </HeaderButton>

          <HeaderButton label="Minimise the chat" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </HeaderButton>
        </div>
      </header>

      {collapsed ? null : (
        <>
        <div
          ref={threadRef}
          className="relative flex-1 overflow-y-auto bg-bg-sunken px-3 py-3"
          // The wallpaper. Painted on the scroll container rather than on a child, so
          // it stays put while the messages move over it — the way a chat ground does.
          style={{
            backgroundImage: CHAT_WALLPAPER,
            backgroundRepeat: 'repeat',
            backgroundSize: '220px 220px',
          }}
        >
          {/* The pattern is drawn in `currentColor`; this veil is what keeps it a
              whisper rather than a rash, in either theme. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-bg-sunken/80" />

          <div className="relative">
            {shown.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-brand/15 text-brand-soft">
                  <Headset className="size-5" />
                </span>
                <p className="text-xs leading-relaxed text-fg-muted">
                  Ask anything about your account, a deposit or a withdrawal. An agent
                  sees your account beside your message, so there is no reference to
                  look up.
                </p>
              </div>
            ) : (
              <Thread messages={shown} readBoundary={readBoundary} undelivered={undelivered} />
            )}
          </div>
        </div>

        {problem !== null ? (
          <p role="status" className="border-t border-down/35 bg-down/8 px-4 py-2 text-2xs text-fg">
            {problem}
          </p>
        ) : null}

        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          onAttach={(file) => void attach(file)}
          attachment={attachment}
          onClearAttachment={() => setAttachment(null)}
          uploading={uploading}
          sending={inFlight > 0}
        />
        </>
      )}
    </div>
  );
}

/** One of the chat window's controls. Square, quiet, and labelled for a reader. */
function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

/**
 * The transcript, grouped by day and by run of author.
 *
 * ── Two groupings, both doing work ─────────────────────────────────────────────
 * A day separator answers "when was this" without putting a date on every line.
 * Collapsing consecutive messages from one author removes the repeated tail and
 * lets a burst of three read as one turn — which is how people actually type, and
 * why a thread without it looks like an argument.
 */
function Thread({
  messages,
  readBoundary,
  undelivered,
}: {
  messages: readonly MessageDto[];
  readBoundary: number;
  /** Optimistic ids the server refused. Marked, rather than quietly removed. */
  undelivered: readonly string[];
}) {
  // Fixed for the render, so every separator in one paint agrees about "today".
  const now = useMemo(() => new Date(), []);

  /**
   * The decoration computed in one pass, before anything renders.
   *
   * Both facts a row needs — whether it opens a new day, and how many of the
   * customer's own messages came before it — depend on everything above it. Working
   * that out inside the `map` means carrying a counter across the render, which is
   * a mutation React's compiler correctly refuses. Doing it here keeps the render
   * pure and the arithmetic in one place.
   */
  const rows = useMemo(() => {
    // Where each of the customer's own messages falls in their own sequence, built
    // once. Counting during the walk would mean a running total reassigned per row,
    // which React's compiler refuses — and rightly: a mutation whose value depends
    // on render order is exactly what breaks when rendering is interrupted.
    const minePosition = new Map(
      messages
        .filter((message) => message.author === 'customer')
        .map((message, position) => [message.id, position] as const),
    );

    return messages.map((message, index) => {
      const previous = index > 0 ? messages[index - 1] : undefined;
      // Purely positional: a row opens a new day when the row above it sits on a
      // different one. No accumulator needed.
      const newDay =
        previous === undefined || utcDayKey(previous.sentAt) !== utcDayKey(message.sentAt);

      return {
        message,
        newDay,
        grouped: !newDay && previous?.author === message.author,
        // Read once the agent has opened everything up to it — see `readBoundary`.
        read:
          message.author === 'customer' && (minePosition.get(message.id) ?? -1) < readBoundary,
      };
    });
  }, [messages, readBoundary]);

  return (
    <>
      {rows.map((row) => (
        <div key={row.message.id}>
          {row.newDay ? (
            <div className="flex justify-center py-2">
              <span className="rounded-full bg-bg-elev/90 px-2.5 py-1 text-2xs font-medium text-fg-subtle shadow-sm">
                {dayLabelFor(row.message.sentAt, now)}
              </span>
            </div>
          ) : null}

          <Bubble
            message={row.message}
            grouped={row.grouped}
            read={row.read}
            undelivered={undelivered.includes(row.message.id)}
          />
        </div>
      ))}
    </>
  );
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function Bubble({
  message,
  grouped,
  read,
  undelivered,
}: {
  message: MessageDto;
  grouped: boolean;
  read: boolean;
  undelivered: boolean;
}) {
  if (message.author === 'system') {
    return (
      <div className="flex justify-center py-1.5">
        <span className="max-w-[90%] rounded-lg bg-bg-elev/90 px-2.5 py-1 text-center text-2xs leading-relaxed text-fg-subtle shadow-sm">
          {message.body}
        </span>
      </div>
    );
  }

  const mine = message.author === 'customer';
  // Still on its way, or refused. Both are "not in the transcript yet"; only the
  // second is final, and saying so is what stops a failed message looking sent.
  const unsent = message.id.startsWith(OPTIMISTIC_PREFIX);

  return (
    <div
      className={cn('flex', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-2')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-2 py-1.5 shadow-sm',
          mine ? 'bg-brand/20 text-fg' : 'border border-line bg-bg-elev text-fg',
          // The clipped corner points at the sender, and only on the first message
          // of a run — which is what makes a burst read as one turn rather than
          // three separate interruptions.
          mine && !grouped && 'rounded-br-md',
          !mine && !grouped && 'rounded-bl-md',
          unsent && 'opacity-60',
        )}
      >
        {message.attachmentId !== null ? (
          <a
            href={`/api/support/attachments/${message.attachmentId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mb-1 block overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image would proxy this through the optimiser, which caches by
                URL and would leave somebody's screenshot in a shared cache. A plain
                img keeps it on the no-store route that authorises every request. */}
            <img
              src={`/api/support/attachments/${message.attachmentId}`}
              alt="Attached image"
              className="max-h-56 w-full bg-surface object-contain"
            />
          </a>
        ) : null}

        {/* The timestamp sits inside the bubble and the text flows around it, which
            is what stops a one-word message being three times taller than it needs
            to be. The float is the mechanism; the cleared spacer reserves the room
            so the last line never runs underneath it. */}
        <div className="px-1.5">
          <span className="float-right ml-2 mt-1 inline-flex select-none items-center gap-0.5 text-[10px] leading-none text-fg-subtle">
            {TIME.format(new Date(message.sentAt))}
            {mine ? (
              undelivered ? (
                <span className="font-medium text-down">Not sent</span>
              ) : unsent ? (
                <Check className="size-3 opacity-50" />
              ) : read ? (
                <CheckCheck className="size-3 text-accent" />
              ) : (
                <Check className="size-3" />
              )
            ) : null}
          </span>

          {message.body.length > 0 ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.body}
            </p>
          ) : null}

          <span aria-hidden className="block clear-both" />
        </div>
      </div>
    </div>
  );
}
