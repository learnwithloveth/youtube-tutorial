import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import { sequentialIdGenerator, type UserId } from '@/shared/kernel/ids';

import type { Conversation, ConversationStatus } from '../../domain/conversation';
import { MAX_MESSAGE_LENGTH, type Message } from '../../domain/message';
import type {
  AttachmentStorage,
  ConversationRepository,
  MessageRepository,
  PushSender,
  RealtimeAuth,
  SupportDependencies,
} from '../ports';
import { createDecideConversation } from '../use-cases/decide-conversation';
import { createPostMessage } from '../use-cases/post-message';

/**
 * The support conversation, with no Firestore and no network.
 *
 * The point of the ports pointing the way they do: the adapter in production is a
 * document database with realtime listeners, and none of the rules below know
 * that. Every one of them is about who may say what, and what a thread looks like
 * afterwards.
 */

const NOW = new Date('2026-09-14T10:00:00.000Z');
const CUSTOMER = 'customer-1' as UserId;
const OTHER = 'customer-2' as UserId;
const OPERATOR = 'operator-1' as UserId;

class FakeConversations implements ConversationRepository {
  readonly store = new Map<string, Conversation>();

  async create(conversation: Conversation) {
    this.store.set(conversation.id, conversation);
  }
  async find(id: string) {
    return this.store.get(id) ?? null;
  }
  async save(conversation: Conversation) {
    this.store.set(conversation.id, conversation);
  }
  async findOpenForUser(userId: UserId) {
    return (
      [...this.store.values()].find(
        (conversation) => conversation.userId === userId && conversation.status === 'open',
      ) ?? null
    );
  }
  async list(query: { status?: ConversationStatus | undefined; limit: number }) {
    return [...this.store.values()]
      .filter((c) => query.status === undefined || c.status === query.status)
      .slice(0, query.limit);
  }
  async countOpen() {
    return [...this.store.values()].filter((c) => c.status === 'open').length;
  }
}

class FakeMessages implements MessageRepository {
  readonly store: Message[] = [];

  async append(message: Message) {
    this.store.push(message);
  }
  async list(conversationId: string, limit: number) {
    return this.store
      .filter((message) => message.snapshot().conversationId === conversationId)
      .slice(0, limit);
  }
}

/**
 * Attachments, in memory.
 *
 * `attach` reproduces the adapter's conditional write: only an existing, unclaimed
 * row owned by the caller can be bound. That rule is the one stopping a customer
 * putting somebody else's image in their own thread, so the fake has to enforce it
 * rather than wave it through.
 */
class FakeAttachments implements AttachmentStorage {
  readonly store = new Map<string, { userId: UserId; conversationId: string | null }>();

  async put(input: { id: string; userId: UserId }) {
    this.store.set(input.id, { userId: input.userId, conversationId: null });
  }
  async get() {
    return null;
  }
  async attach(id: string, conversationId: string, userId: UserId) {
    const row = this.store.get(id);
    if (row === undefined || row.userId !== userId || row.conversationId !== null) return false;
    this.store.set(id, { ...row, conversationId });
    return true;
  }
  async deleteOrphansBefore() {
    return 0;
  }
}

class FakePush implements PushSender {
  readonly sent: { audience: unknown; title: string }[] = [];

  async register() {}
  async forget() {}
  async notify(input: { audience: unknown; title: string }) {
    this.sent.push({ audience: input.audience, title: input.title });
    return 1;
  }
}

function build() {
  const conversations = new FakeConversations();
  const messages = new FakeMessages();
  const push = new FakePush();
  const attachments = new FakeAttachments();

  const deps: SupportDependencies = {
    conversations,
    messages,
    push,
    attachments,
    realtime: { async issueToken() {
      return 'token';
    } } as RealtimeAuth,
    ids: sequentialIdGenerator(),
    clock: fixedClock(NOW),
  };

  return {
    conversations,
    messages,
    push,
    attachments,
    post: createPostMessage(deps),
    decide: createDecideConversation(deps),
  };
}

describe('support conversations', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it("opens a thread on a customer's first message and names it from what they wrote", async () => {
    const result = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      body: 'My SEPA deposit has not landed after two hours — reference NVX-8841.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.opened).toBe(true);
    // Derived, because the widget never asks for a subject.
    expect(result.value.conversation.subject).toContain('SEPA deposit has not landed');
    expect(result.value.conversation.unreadForOperator).toBe(1);
    expect(harness.push.sent).toHaveLength(1);
  });

  it('continues the same thread rather than opening a second', async () => {
    const first = await harness.post({ author: 'customer', authorId: CUSTOMER, body: 'Hello' });
    const second = await harness.post({ author: 'customer', authorId: CUSTOMER, body: 'Still there?' });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.opened).toBe(false);
    expect(second.value.conversation.id).toBe(first.value.conversation.id);
    expect(harness.conversations.store.size).toBe(1);
    // Two unread for the operator, because nobody has replied.
    expect(second.value.conversation.unreadForOperator).toBe(2);
  });

  it("refuses a customer writing into somebody else's thread, without confirming it exists", async () => {
    const mine = await harness.post({ author: 'customer', authorId: CUSTOMER, body: 'Hello' });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;

    const intruder = await harness.post({
      author: 'customer',
      authorId: OTHER,
      conversationId: mine.value.conversation.id,
      body: 'Let me see that',
    });

    expect(intruder.ok).toBe(false);
    if (intruder.ok) return;
    // The same error a missing id produces. Telling a caller which of their guesses
    // was real is the first thing worth knowing if you are enumerating threads.
    expect(intruder.error.kind).toBe('conversation-not-found');
  });

  it('refuses to let an operator start a conversation', async () => {
    // A support thread the customer never opened is a message arriving from
    // nowhere, in a transcript they can read.
    const result = await harness.post({ author: 'operator', authorId: OPERATOR, body: 'Hi there' });

    expect(result.ok).toBe(false);
  });

  it("moves the unread badge to the customer when an operator replies", async () => {
    const opened = await harness.post({ author: 'customer', authorId: CUSTOMER, body: 'Hello' });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const reply = await harness.post({
      author: 'operator',
      authorId: OPERATOR,
      conversationId: opened.value.conversation.id,
      body: 'Looking into it now.',
    });

    expect(reply.ok).toBe(true);
    if (!reply.ok) return;

    expect(reply.value.conversation.unreadForCustomer).toBe(1);
    // Unchanged: replying is not the same as reading, and the console clears it
    // explicitly when a thread is opened.
    expect(reply.value.conversation.unreadForOperator).toBe(1);
    expect(harness.push.sent.at(-1)?.audience).toEqual({ userId: CUSTOMER });
  });

  it('reopens a resolved thread when the customer writes again', async () => {
    const opened = await harness.post({ author: 'customer', authorId: CUSTOMER, body: 'Hello' });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const resolved = await harness.decide({
      conversationId: opened.value.conversation.id,
      operatorId: OPERATOR,
      action: { kind: 'resolve' },
    });
    expect(resolved.ok && resolved.value.status).toBe('resolved');
    // Resolving implies the operator read it.
    expect(resolved.ok && resolved.value.unreadForOperator).toBe(0);

    const again = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      conversationId: opened.value.conversation.id,
      body: 'It happened again.',
    });

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    // Without this, an operator resolves, the customer answers, and the message
    // lands in a thread nobody is looking at.
    expect(again.value.conversation.status).toBe('open');
    expect(again.value.conversation.unreadForOperator).toBe(1);
  });

  it('writes a system line when a thread is claimed or resolved, credited to nobody', async () => {
    const opened = await harness.post({ author: 'customer', authorId: CUSTOMER, body: 'Hello' });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const claimed = await harness.decide({
      conversationId: opened.value.conversation.id,
      operatorId: OPERATOR,
      action: { kind: 'claim' },
    });

    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.value.assignedTo).toBe(OPERATOR);

    const system = harness.messages.store.filter((m) => m.snapshot().author === 'system');
    expect(system).toHaveLength(1);
    // A line no person typed is attributed to no person.
    expect(system[0]?.snapshot().authorId).toBeNull();
    // And it counts for nobody: a thread that announces itself must not light up a
    // badge for a message no human wrote.
    expect(claimed.value.unreadForCustomer).toBe(0);
  });

  it('lets an image stand as a message on its own', async () => {
    await harness.attachments.put({ id: 'img-1', userId: CUSTOMER });

    // No caption. Somebody who screenshots the error has said something, and
    // demanding text alongside it would be a field between them and the point.
    const result = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      body: '',
      attachmentId: 'img-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.message.attachmentId).toBe('img-1');
    // The conversation list still has to read as something.
    expect(result.value.conversation.lastMessagePreview).toBe('Sent an image');
  });

  it("refuses an image the sender did not upload", async () => {
    // The whole point of claiming rather than trusting: an id is guessable, and a
    // message referencing somebody else's upload would render their screenshot
    // inside the guesser's own thread.
    await harness.attachments.put({ id: 'img-theirs', userId: OTHER });

    const result = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      body: 'Look at this',
      attachmentId: 'img-theirs',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('attachment-unavailable');
    // Nothing was written: no thread, no message.
    expect(harness.messages.store).toHaveLength(0);
  });

  it('refuses to attach the same image twice', async () => {
    await harness.attachments.put({ id: 'img-1', userId: CUSTOMER });

    const first = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      body: 'Here',
      attachmentId: 'img-1',
    });
    expect(first.ok).toBe(true);

    // Already claimed. A replayed request must not put one upload on two messages.
    const second = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      body: 'And again',
      attachmentId: 'img-1',
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe('attachment-unavailable');
  });

  it('rejects an empty or oversized message before anything is written', async () => {
    const empty = await harness.post({ author: 'customer', authorId: CUSTOMER, body: '   ' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.kind).toBe('message-empty');

    const huge = await harness.post({
      author: 'customer',
      authorId: CUSTOMER,
      body: 'x'.repeat(MAX_MESSAGE_LENGTH + 1),
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error.kind).toBe('message-too-long');

    // Neither attempt created a thread. A validation failure that leaves an empty
    // conversation behind is one an operator has to close by hand.
    expect(harness.conversations.store.size).toBe(0);
    expect(harness.messages.store).toHaveLength(0);
  });
});
