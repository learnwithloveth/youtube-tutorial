import type { Clock } from '@/shared/kernel';
import type { IdGenerator, UserId } from '@/shared/kernel/ids';

import type { AttachmentContentType } from '../domain/attachment';
import type { Conversation, ConversationStatus } from '../domain/conversation';
import type { Message } from '../domain/message';

/**
 * Ports for the support module.
 *
 * ── Why these look like every other module's, despite Firestore ────────────────
 * The adapter behind them is a document database with realtime listeners rather
 * than Postgres, and nothing above this file knows that. The use cases save a
 * `Conversation`; whether that lands in a Firestore document, a Postgres row or a
 * test's `Map` is the composition root's business.
 *
 * That is not architecture for its own sake here — it is the thing that makes the
 * choice reversible. Firestore is chosen because a serverless deployment cannot
 * hold a socket, which is a hosting fact, not a domain one.
 */

export interface ConversationRepository {
  create(conversation: Conversation): Promise<void>;
  find(id: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;

  /**
   * The customer's current thread, if one is open.
   *
   * What makes the widget a chat rather than a ticket form: a returning customer
   * continues where they left off instead of filing a second case about the same
   * problem.
   */
  findOpenForUser(userId: UserId): Promise<Conversation | null>;

  /**
   * The customer's most recent thread, open or not.
   *
   * A different question from `findOpenForUser`, which is why it is a different
   * method. Posting needs to know whether there is an *open* thread to continue;
   * the widget needs to show the last one either way, because a resolved thread is
   * still the conversation a customer is looking at — and replying to it reopens it.
   *
   * They were the same call once, and the result was a server render that dropped
   * the thread the moment an agent resolved it while the listener kept showing it.
   */
  findLatestForUser(userId: UserId): Promise<Conversation | null>;

  /** The console's list. Newest activity first — a support inbox is read from the top. */
  list(query: {
    status?: ConversationStatus | undefined;
    assignedTo?: UserId | undefined;
    limit: number;
  }): Promise<Conversation[]>;

  /** How many threads are open, for the rail badge. Counted, not listed. */
  countOpen(): Promise<number>;
}

export interface MessageRepository {
  append(message: Message): Promise<void>;
  /** Oldest first — a transcript is read in the order it happened. */
  list(conversationId: string, limit: number): Promise<Message[]>;
}

/**
 * A short-lived credential letting one browser subscribe to its own data.
 *
 * ── Why a second identity exists at all ────────────────────────────────────────
 * Reads come straight from Firestore to the browser, which is the entire point —
 * that is the socket this application cannot otherwise hold. Firestore's security
 * rules therefore have to know who is asking, and they cannot read this
 * application's session cookie.
 *
 * So the session remains the only authority: a route handler proves who the caller
 * is the usual way, through `src/server/auth.ts`, and *then* mints a token saying
 * so. Nobody signs in to Firebase; there is no second password, no second account,
 * and no way to obtain one of these without already holding a valid session.
 */
export interface RealtimeAuth {
  issueToken(userId: UserId, role: 'customer' | 'operator'): Promise<string>;
}

/** One browser that has agreed to receive notifications. */
export interface DeviceRegistration {
  readonly token: string;
  readonly userId: UserId;
  readonly role: 'customer' | 'operator';
}

/**
 * Push notification delivery.
 *
 * Best-effort by contract: `notify` never throws and never fails the message it is
 * announcing. A customer's question must land whether or not an operator's phone
 * can be reached, and a push that fails is a notification nobody got — not a
 * conversation nobody had.
 *
 * ── Not only support's ─────────────────────────────────────────────────────────
 * The device registry lives in this module because support was the first thing to
 * push. Account notifications — a price alert firing, a withdrawal decided — are
 * sent through the same port from `server/notifications.ts`, so a browser has one
 * registration and one switch, whatever the message is about.
 */
export interface PushSender {
  /**
   * Saves a browser's registration — unless its token is already dead.
   *
   * `stale-token` means FCM no longer recognises the token, and nothing was saved.
   * The browser has to throw its subscription away and ask for a new one; see
   * `use-push.ts` for why it would otherwise keep offering the same dead token.
   */
  register(device: DeviceRegistration): Promise<RegistrationOutcome>;
  forget(token: string): Promise<void>;
  /** Every device registered to one account. Returns how many there were. */
  forgetAllFor(userId: UserId): Promise<number>;
  /** Returns how many devices accepted it, for the log. Never throws. */
  notify(input: PushMessage): Promise<number>;
}

export interface PushMessage {
  readonly audience: 'operators' | { userId: UserId };
  readonly title: string;
  readonly body: string;
  /**
   * Where a click lands, as a path on this site — `/app/alerts`.
   *
   * A path, not a URL: the service worker resolves it against the origin it was
   * installed from, so a notification always opens the site that registered the
   * browser rather than whichever origin `APP_URL` happens to name.
   */
  readonly link: string;
  /**
   * Notifications sharing a tag replace one another on the device instead of
   * stacking — one per conversation, one per alert. Left out when every message
   * deserves to be seen on its own, as two withdrawals do.
   */
  readonly tag?: string | undefined;
  /**
   * The screen that already shows this message live, if there is one.
   *
   * A device skips the system notification while somebody is looking at that
   * screen: an agent working the queue does not need their operating system to
   * announce the message that just appeared in front of them.
   */
  readonly surface?: PushSurface | undefined;
}

export type PushSurface = 'support-queue' | 'support-thread';

export type RegistrationOutcome = 'registered' | 'stale-token';

/** One stored image, as the serving route needs it. */
export interface StoredAttachment {
  readonly id: string;
  /** Who uploaded it — a customer on one side of a conversation, an operator on the other. */
  readonly userId: UserId;
  /** The conversation it was claimed by, or null while it is still an orphan. */
  readonly conversationId: string | null;
  /**
   * The customer whose conversation it is, or null while it is unclaimed.
   *
   * This, not `userId`, is what the serving route authorises a customer against:
   * an operator's reply carries their own id as the uploader, and the customer it
   * was sent to has to be able to see it.
   */
  readonly customerId: UserId | null;
  readonly contentType: AttachmentContentType;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
}

/**
 * Where attachment bytes live.
 *
 * A port, because the storage will move: the first adapter keeps bytes in Postgres,
 * which needs no credentials and puts them beside every other piece of this
 * application's data. Object storage with presigned uploads is where this ends up,
 * and keeping it behind a port means that is an adapter and a line in `module.ts`.
 */
export interface AttachmentStorage {
  /**
   * Stores bytes the caller has *already sniffed*.
   *
   * Takes a content type rather than deriving one, so no adapter can be the place
   * that trusts a filename. The row is unattached until a message claims it.
   */
  put(input: {
    id: string;
    userId: UserId;
    bytes: Uint8Array;
    contentType: AttachmentContentType;
  }): Promise<void>;

  get(id: string): Promise<StoredAttachment | null>;

  /**
   * Binds an upload to the conversation whose message references it.
   *
   * Returns false when the row does not exist, belongs to somebody else, or has
   * already been claimed — which is the check that stops one customer attaching
   * another's image to their own thread by guessing an id. It has to be part of
   * the write, not a read beforehand, or two requests racing one id both win.
   *
   * `customerId` is recorded rather than derived later: the caller is holding the
   * conversation, and the route that serves the bytes would otherwise have to read
   * it from Firestore on every request for every image.
   */
  attach(input: {
    id: string;
    conversationId: string;
    /** The uploader. Scopes the claim.  */
    uploadedBy: UserId;
    /** Whose conversation it is. Decides who may later see the bytes. */
    customerId: UserId;
  }): Promise<boolean>;

  /** Uploads that never became a message: somebody picked a file and left. */
  deleteOrphansBefore(cutoff: Date, limit: number): Promise<number>;
}

export interface SupportDependencies {
  conversations: ConversationRepository;
  messages: MessageRepository;
  realtime: RealtimeAuth;
  push: PushSender;
  attachments: AttachmentStorage;
  ids: IdGenerator;
  clock: Clock;
  /**
   * The site's name, for the words a notification opens with.
   *
   * Injected: it is the deployment's to set, and a use case that read the
   * environment could not be tested without global state.
   */
  siteName: string;
}
