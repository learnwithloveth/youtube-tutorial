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
 */
export interface PushSender {
  register(device: DeviceRegistration): Promise<void>;
  forget(token: string): Promise<void>;
  /** Returns how many devices accepted it, for the log. Never throws. */
  notify(input: {
    audience: 'operators' | { userId: UserId };
    title: string;
    body: string;
    conversationId: string;
  }): Promise<number>;
}

/** One stored image, as the serving route needs it. */
export interface StoredAttachment {
  readonly id: string;
  /** Who uploaded it. The authorisation check on the serving route reads this. */
  readonly userId: UserId;
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
   */
  attach(id: string, conversationId: string, userId: UserId): Promise<boolean>;

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
}
