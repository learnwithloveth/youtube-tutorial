import type { UserId } from '@/shared/kernel/ids';

/**
 * One message in a support conversation.
 *
 * ── Three authors, not two ─────────────────────────────────────────────────────
 * `system` exists because some lines in a thread were not typed by anyone — a
 * conversation reopening, an operator claiming it. Modelling those as an operator
 * message would put words in a named person's mouth in a transcript a customer can
 * read, and modelling them as customer messages is worse.
 */
export type MessageAuthor = 'customer' | 'operator' | 'system';

/**
 * The longest message accepted.
 *
 * Generous enough for a customer pasting an error, small enough that the document
 * stays well inside Firestore's 1 MiB limit with room for the fields around it.
 * Enforced here rather than by a textarea `maxlength`, because the textarea is not
 * what posts the message — a route handler is, and it is a public endpoint.
 */
export const MAX_MESSAGE_LENGTH = 4_000;

export interface MessageSnapshot {
  readonly id: string;
  readonly conversationId: string;
  /**
   * The customer the conversation belongs to, copied onto every message.
   *
   * Denormalised deliberately. Firestore security rules charge a document read for
   * every `get()` they perform, so a rule that checked the parent conversation's
   * owner would bill one extra read *per message* on every load of a thread. With
   * the owner on the message, the rule is a field comparison and costs nothing.
   */
  readonly userId: UserId;
  readonly author: MessageAuthor;
  /** Who typed it. Null for `system`, which nobody typed. */
  readonly authorId: UserId | null;
  readonly body: string;
  /** An image stored in Postgres — see `domain/attachment.ts`. Null for most. */
  readonly attachmentId: string | null;
  readonly sentAt: Date;
}

export class Message {
  private constructor(private readonly snap: MessageSnapshot) {}

  static create(input: {
    id: string;
    conversationId: string;
    userId: UserId;
    author: MessageAuthor;
    authorId: UserId | null;
    body: string;
    attachmentId?: string | null | undefined;
    sentAt: Date;
  }): Message {
    const body = input.body.trim();
    const attachmentId = input.attachmentId ?? null;

    // Thrown, not returned: the use case checks all of these and returns a
    // `SupportError` before ever reaching here, so a failure at this point is a
    // caller that skipped the check — a bug, with no useful recovery.
    //
    // An image on its own is a message. Somebody who screenshots the error and
    // sends it has said something, and demanding a caption would be a field
    // between them and the point.
    if (body.length === 0 && attachmentId === null) {
      throw new Error('A message needs text or an image');
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`A message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
    }

    return new Message({ ...input, body, attachmentId });
  }

  static rehydrate(snapshot: MessageSnapshot): Message {
    return new Message(snapshot);
  }

  get id(): string {
    return this.snap.id;
  }
  get body(): string {
    return this.snap.body;
  }
  get author(): MessageAuthor {
    return this.snap.author;
  }
  get attachmentId(): string | null {
    return this.snap.attachmentId;
  }
  get sentAt(): Date {
    return this.snap.sentAt;
  }

  snapshot(): MessageSnapshot {
    return this.snap;
  }
}

/**
 * The one-line summary a conversation list shows.
 *
 * Collapses whitespace first: a pasted stack trace is mostly newlines, and a
 * preview carrying them renders as a tall blank space in a list where every row is
 * supposed to be the same height.
 */
export function previewOf(body: string, limit = 120): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/**
 * How a message reads when it is summarised rather than shown.
 *
 * ── Why this is not just `previewOf` ───────────────────────────────────────────
 * An image with no caption has an empty body, and a conversation list row whose
 * preview is an empty string reads as a bug — or worse, as a message that failed
 * to send. It said something; the summary has to say what.
 *
 * One function rather than the fallback written at each call site, because there
 * are two — the thread's stored summary and the push notification — and they
 * describe the same message. Two spellings of "Sent an image" is how an inbox and
 * a phone end up disagreeing about what just arrived.
 */
export function summaryOf(
  message: { body: string; attachmentId: string | null },
  limit = 120,
): string {
  const text = previewOf(message.body, limit);
  if (text.length > 0) return text;
  return message.attachmentId !== null ? 'Sent an image' : '';
}
