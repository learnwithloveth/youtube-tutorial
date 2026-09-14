import type { UserId } from '@/shared/kernel/ids';

import { previewOf, summaryOf, type Message, type MessageAuthor } from './message';

/**
 * One customer's thread with support.
 *
 * ── A thread, not a ticket queue ───────────────────────────────────────────────
 * A customer has at most one *open* conversation at a time. That is what a chat
 * widget is: reopening it continues where they left off, and a second message
 * about a second problem lands in the same place a person is already reading.
 *
 * The alternative — a new ticket per subject — needs the customer to decide which
 * of their threads a message belongs to, which is a filing decision they have no
 * reason to care about and will get wrong.
 *
 * ── A customer's reply reopens a resolved thread ───────────────────────────────
 * Without that rule, an operator resolves, the customer answers, and the message
 * lands in a conversation nobody is looking at any more. Resolving is a statement
 * about the operator's belief, not a lock on the customer's keyboard.
 */

export type ConversationStatus = 'open' | 'resolved';

/**
 * How urgent this is, as an operator judged it.
 *
 * Set by the console, never by the customer. A field where the person waiting
 * picks their own priority is a field where everything is urgent, which is the
 * same as having no field.
 */
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent';

export const MAX_SUBJECT_LENGTH = 140;

export interface ConversationSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly subject: string;
  readonly status: ConversationStatus;
  readonly priority: ConversationPriority;
  /** The operator who claimed it, or null while it is anybody's. */
  readonly assignedTo: UserId | null;
  readonly openedAt: Date;
  readonly lastMessageAt: Date;
  /** Denormalised so a conversation list needs no read of the messages. */
  readonly lastMessagePreview: string;
  readonly lastMessageAuthor: MessageAuthor;
  /**
   * Messages the other side has not seen.
   *
   * Stored rather than derived, because deriving it means reading every message in
   * every conversation to render a list of conversations — which is the read that
   * makes an inbox expensive, on the screen that is open all day.
   */
  readonly unreadForOperator: number;
  readonly unreadForCustomer: number;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: UserId | null;
}

export class Conversation {
  private constructor(private snap: ConversationSnapshot) {}

  static open(input: {
    id: string;
    userId: UserId;
    subject: string;
    at: Date;
  }): Conversation {
    const subject = input.subject.trim().slice(0, MAX_SUBJECT_LENGTH);
    if (subject.length === 0) throw new Error('A conversation needs a subject');

    return new Conversation({
      id: input.id,
      userId: input.userId,
      subject,
      status: 'open',
      priority: 'normal',
      assignedTo: null,
      openedAt: input.at,
      lastMessageAt: input.at,
      lastMessagePreview: '',
      lastMessageAuthor: 'system',
      unreadForOperator: 0,
      unreadForCustomer: 0,
      resolvedAt: null,
      resolvedBy: null,
    });
  }

  static rehydrate(snapshot: ConversationSnapshot): Conversation {
    return new Conversation(snapshot);
  }

  get id(): string {
    return this.snap.id;
  }
  get userId(): UserId {
    return this.snap.userId;
  }
  get status(): ConversationStatus {
    return this.snap.status;
  }
  get assignedTo(): UserId | null {
    return this.snap.assignedTo;
  }

  /** Whether this customer may see this thread. */
  belongsTo(userId: UserId): boolean {
    return this.snap.userId === userId;
  }

  /**
   * Folds a new message into the thread's summary.
   *
   * The unread counter goes up for whoever did *not* send it, and a `system` line
   * counts for nobody — a thread that reopens itself should not show an operator a
   * badge for a message no person wrote.
   */
  recordMessage(message: Message): void {
    const author = message.author;

    this.snap = {
      ...this.snap,
      // A customer writing to a resolved thread reopens it. The alternative is a
      // reply nobody is looking at.
      status: author === 'customer' ? 'open' : this.snap.status,
      resolvedAt: author === 'customer' ? null : this.snap.resolvedAt,
      resolvedBy: author === 'customer' ? null : this.snap.resolvedBy,
      lastMessageAt: message.sentAt,
      lastMessagePreview: summaryOf(message.snapshot()),
      lastMessageAuthor: author,
      unreadForOperator:
        author === 'customer' ? this.snap.unreadForOperator + 1 : this.snap.unreadForOperator,
      unreadForCustomer:
        author === 'operator' ? this.snap.unreadForCustomer + 1 : this.snap.unreadForCustomer,
    };
  }

  /** Claims the thread. Claiming one somebody else holds is allowed and logged. */
  assign(operatorId: UserId): void {
    this.snap = { ...this.snap, assignedTo: operatorId };
  }

  setPriority(priority: ConversationPriority): void {
    this.snap = { ...this.snap, priority };
  }

  resolve(operatorId: UserId, at: Date): void {
    this.snap = {
      ...this.snap,
      status: 'resolved',
      resolvedAt: at,
      resolvedBy: operatorId,
      // Resolving implies the operator read it. Leaving the badge up would mean
      // every resolved thread stays lit until somebody clicks it again.
      unreadForOperator: 0,
    };
  }

  markRead(by: 'customer' | 'operator'): void {
    this.snap =
      by === 'operator'
        ? { ...this.snap, unreadForOperator: 0 }
        : { ...this.snap, unreadForCustomer: 0 };
  }

  snapshot(): ConversationSnapshot {
    return this.snap;
  }
}

/**
 * A subject derived from the first thing the customer said.
 *
 * The widget asks for a message, not a message *and* a subject. A field between
 * someone with a problem and the box they type it in is a field that turns a
 * question into an abandoned session — and the first line of what they wrote is a
 * better summary than most people would have typed into a "Subject" input anyway.
 */
export function subjectFrom(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? body;
  return previewOf(firstLine, 70) || 'New conversation';
}
