import type {
  Conversation,
  ConversationPriority,
  ConversationStatus,
} from '../domain/conversation';
import type { Message, MessageAuthor } from '../domain/message';

/**
 * Support DTOs.
 *
 * Instants cross as ISO strings, never as `Date` and never as a Firestore
 * `Timestamp`. A `Timestamp` leaking to a Server Component would drag the Firebase
 * SDK's classes through the RSC payload, where they do not survive serialisation —
 * and a `Date` reaching a Client Component is a hydration mismatch waiting for the
 * first viewer in a different timezone.
 */

export interface MessageDto {
  readonly id: string;
  readonly conversationId: string;
  readonly author: MessageAuthor;
  readonly authorId: string | null;
  readonly body: string;
  /** Fetched from `/api/support/attachments/<id>`, never inlined. */
  readonly attachmentId: string | null;
  readonly sentAt: string;
}

export interface ConversationDto {
  readonly id: string;
  readonly userId: string;
  readonly subject: string;
  readonly status: ConversationStatus;
  readonly priority: ConversationPriority;
  readonly assignedTo: string | null;
  readonly openedAt: string;
  readonly lastMessageAt: string;
  readonly lastMessagePreview: string;
  readonly lastMessageAuthor: MessageAuthor;
  readonly unreadForOperator: number;
  readonly unreadForCustomer: number;
  readonly resolvedAt: string | null;
}

export function toConversationDto(conversation: Conversation): ConversationDto {
  const snapshot = conversation.snapshot();
  return {
    id: snapshot.id,
    userId: snapshot.userId,
    subject: snapshot.subject,
    status: snapshot.status,
    priority: snapshot.priority,
    assignedTo: snapshot.assignedTo,
    openedAt: snapshot.openedAt.toISOString(),
    lastMessageAt: snapshot.lastMessageAt.toISOString(),
    lastMessagePreview: snapshot.lastMessagePreview,
    lastMessageAuthor: snapshot.lastMessageAuthor,
    unreadForOperator: snapshot.unreadForOperator,
    unreadForCustomer: snapshot.unreadForCustomer,
    resolvedAt: snapshot.resolvedAt?.toISOString() ?? null,
  };
}

export function toMessageDto(message: Message): MessageDto {
  const snapshot = message.snapshot();
  return {
    id: snapshot.id,
    conversationId: snapshot.conversationId,
    author: snapshot.author,
    authorId: snapshot.authorId,
    body: snapshot.body,
    attachmentId: snapshot.attachmentId,
    sentAt: snapshot.sentAt.toISOString(),
  };
}
