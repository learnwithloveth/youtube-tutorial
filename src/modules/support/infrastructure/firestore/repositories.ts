import 'server-only';

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import type { UserId } from '@/shared/kernel/ids';

import {
  Conversation,
  type ConversationPriority,
  type ConversationStatus,
} from '../../domain/conversation';
import { Message, type MessageAuthor } from '../../domain/message';
import type { ConversationRepository, MessageRepository } from '../../application/ports';

import { COLLECTIONS } from './app';

/**
 * Conversations and messages, in Firestore.
 *
 * ── Why the shape of a document is not the shape of the entity ─────────────────
 * The entity carries `Date`; the document carries `Timestamp`. The entity's
 * `status` is a union; the document's is a string. Converting at this boundary is
 * what keeps `firebase-admin` out of the domain — nothing above this file imports
 * anything from Firebase, which is the whole reason the port exists.
 *
 * ── Every query here has an index behind it ────────────────────────────────────
 * Firestore refuses a composite query with no matching index rather than running
 * it slowly, so a missing one is a hard failure the first time a filter is used —
 * not a gradual slowdown. They are declared in `firestore.indexes.json`, and the
 * console's error message links straight to a one-click creation page if one is
 * ever missed.
 */

interface ConversationDocument {
  userId: string;
  subject: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  assignedTo: string | null;
  openedAt: Timestamp;
  lastMessageAt: Timestamp;
  lastMessagePreview: string;
  lastMessageAuthor: MessageAuthor;
  unreadForOperator: number;
  unreadForCustomer: number;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
}

interface MessageDocument {
  conversationId: string;
  userId: string;
  author: MessageAuthor;
  authorId: string | null;
  body: string;
  /** The Postgres row holding the image. An id, never the bytes. */
  attachmentId: string | null;
  sentAt: Timestamp;
}

export class FirestoreConversationRepository implements ConversationRepository {
  constructor(private readonly db: Firestore) {}

  async create(conversation: Conversation): Promise<void> {
    const snapshot = conversation.snapshot();
    await this.doc(snapshot.id).create(toConversationDocument(conversation));
  }

  async find(id: string): Promise<Conversation | null> {
    const document = await this.doc(id).get();
    if (!document.exists) return null;

    return toConversation(id, document.data() as ConversationDocument);
  }

  async save(conversation: Conversation): Promise<void> {
    // `set` with merge rather than `update`: the caller holds the whole entity, so
    // a partial write would mean deciding here which fields the domain changed —
    // a duplicate of the entity's own logic, in the layer least able to know.
    await this.doc(conversation.id).set(toConversationDocument(conversation), { merge: true });
  }

  async findOpenForUser(userId: UserId): Promise<Conversation | null> {
    const results = await this.collection()
      .where('userId', '==', userId)
      .where('status', '==', 'open')
      .orderBy('lastMessageAt', 'desc')
      .limit(1)
      .get();

    const document = results.docs[0];
    return document === undefined
      ? null
      : toConversation(document.id, document.data() as ConversationDocument);
  }

  async list(query: {
    status?: ConversationStatus | undefined;
    assignedTo?: UserId | undefined;
    limit: number;
  }): Promise<Conversation[]> {
    let cursor = this.collection().orderBy('lastMessageAt', 'desc').limit(query.limit);
    if (query.status !== undefined) cursor = cursor.where('status', '==', query.status);
    if (query.assignedTo !== undefined) {
      cursor = cursor.where('assignedTo', '==', query.assignedTo);
    }

    const results = await cursor.get();
    return results.docs.map((document) =>
      toConversation(document.id, document.data() as ConversationDocument),
    );
  }

  async countOpen(): Promise<number> {
    // `count()` is an aggregation query: the server counts and returns a number,
    // billed at one read per batch of documents rather than one per document. The
    // obvious version — fetching the ids and taking `.length` — bills for every
    // open conversation every time the rail renders.
    const result = await this.collection().where('status', '==', 'open').count().get();
    return result.data().count;
  }

  private collection() {
    return this.db.collection(COLLECTIONS.conversations);
  }

  private doc(id: string) {
    return this.collection().doc(id);
  }
}

export class FirestoreMessageRepository implements MessageRepository {
  constructor(private readonly db: Firestore) {}

  async append(message: Message): Promise<void> {
    const snapshot = message.snapshot();
    await this.db
      .collection(COLLECTIONS.conversations)
      .doc(snapshot.conversationId)
      .collection(COLLECTIONS.messages)
      .doc(snapshot.id)
      // `create`, not `set`: an id that already exists is a duplicate delivery, and
      // failing loudly is better than silently overwriting a message somebody sent.
      .create({
        conversationId: snapshot.conversationId,
        userId: snapshot.userId,
        author: snapshot.author,
        authorId: snapshot.authorId,
        body: snapshot.body,
        attachmentId: snapshot.attachmentId,
        sentAt: Timestamp.fromDate(snapshot.sentAt),
      } satisfies MessageDocument);
  }

  async list(conversationId: string, limit: number): Promise<Message[]> {
    const results = await this.db
      .collection(COLLECTIONS.conversations)
      .doc(conversationId)
      .collection(COLLECTIONS.messages)
      // Newest first in the query, reversed below. Asking for the *oldest* `limit`
      // would truncate a long thread at its beginning and hide what just happened.
      .orderBy('sentAt', 'desc')
      .limit(limit)
      .get();

    return results.docs
      .map((document) => {
        const data = document.data() as MessageDocument;
        return Message.rehydrate({
          id: document.id,
          conversationId: data.conversationId,
          userId: data.userId as UserId,
          author: data.author,
          authorId: (data.authorId as UserId | null) ?? null,
          body: data.body,
          attachmentId: data.attachmentId ?? null,
          sentAt: data.sentAt.toDate(),
        });
      })
      .reverse();
  }
}

function toConversationDocument(conversation: Conversation): ConversationDocument {
  const snapshot = conversation.snapshot();
  return {
    userId: snapshot.userId,
    subject: snapshot.subject,
    status: snapshot.status,
    priority: snapshot.priority,
    assignedTo: snapshot.assignedTo,
    openedAt: Timestamp.fromDate(snapshot.openedAt),
    lastMessageAt: Timestamp.fromDate(snapshot.lastMessageAt),
    lastMessagePreview: snapshot.lastMessagePreview,
    lastMessageAuthor: snapshot.lastMessageAuthor,
    unreadForOperator: snapshot.unreadForOperator,
    unreadForCustomer: snapshot.unreadForCustomer,
    resolvedAt: snapshot.resolvedAt === null ? null : Timestamp.fromDate(snapshot.resolvedAt),
    resolvedBy: snapshot.resolvedBy,
  };
}

function toConversation(id: string, data: ConversationDocument): Conversation {
  return Conversation.rehydrate({
    id,
    userId: data.userId as UserId,
    subject: data.subject,
    status: data.status,
    priority: data.priority,
    assignedTo: (data.assignedTo as UserId | null) ?? null,
    openedAt: data.openedAt.toDate(),
    lastMessageAt: data.lastMessageAt.toDate(),
    lastMessagePreview: data.lastMessagePreview,
    lastMessageAuthor: data.lastMessageAuthor,
    unreadForOperator: data.unreadForOperator,
    unreadForCustomer: data.unreadForCustomer,
    resolvedAt: data.resolvedAt?.toDate() ?? null,
    resolvedBy: (data.resolvedBy as UserId | null) ?? null,
  });
}

/** Re-exported so the push adapter can share the server timestamp sentinel. */
export { FieldValue };
