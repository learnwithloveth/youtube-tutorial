import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { Conversation, subjectFrom } from '../../domain/conversation';
import { SupportErrors, type SupportError } from '../../domain/errors';
import { MAX_MESSAGE_LENGTH, Message, summaryOf } from '../../domain/message';
import { toConversationDto, toMessageDto, type ConversationDto, type MessageDto } from '../dto';
import type { SupportDependencies } from '../ports';

/**
 * Someone says something.
 *
 * ── One use case for both directions ───────────────────────────────────────────
 * A customer's first message, a customer's tenth, and an operator's reply are the
 * same operation with a different author: append, fold into the thread's summary,
 * tell the other side. Splitting them into `askQuestion` and `replyToCustomer`
 * would duplicate the interesting half — the summary bookkeeping — in two places
 * that then drift.
 *
 * What differs is authority, and that is checked once, here:
 *
 *  - A customer may only write to their own thread, and opening one is implicit:
 *    if they have no open conversation, this creates it.
 *  - An operator may write to any thread, and may not create one. A support thread
 *    a customer never started is a message arriving from nowhere.
 *
 * ── Why the push is awaited but cannot fail ────────────────────────────────────
 * `notify` is best-effort by contract. The message is already written by the time
 * it runs, so a failure there costs a notification, not a conversation — and the
 * alternative, letting it reject, would turn an unreachable phone into a customer
 * seeing their question fail to send.
 */

export interface PostMessageCommand {
  /** Omitted by a customer starting fresh; required for an operator. */
  readonly conversationId?: string | undefined;
  readonly author: 'customer' | 'operator';
  readonly authorId: UserId;
  /** The customer whose thread this is. For an operator, read from the thread. */
  readonly userId?: UserId | undefined;
  readonly body: string;
  /** An image already uploaded by this caller. Claimed here, not trusted. */
  readonly attachmentId?: string | undefined;
}

export interface PostMessageResult {
  readonly conversation: ConversationDto;
  readonly message: MessageDto;
  /** True when this message created the thread. The widget scrolls differently. */
  readonly opened: boolean;
}

export type PostMessage = (
  command: PostMessageCommand,
) => Promise<Result<PostMessageResult, SupportError>>;

export function createPostMessage(deps: SupportDependencies): PostMessage {
  return async function postMessage(command) {
    const body = command.body.trim();
    const attachmentId = command.attachmentId ?? null;

    // An image on its own is a message. Somebody who screenshots the error and
    // sends it has said something, and demanding a caption would be a field
    // between them and the point.
    if (body.length === 0 && attachmentId === null) return err(SupportErrors.messageEmpty());
    if (body.length > MAX_MESSAGE_LENGTH) return err(SupportErrors.messageTooLong());

    const now = deps.clock.now();

    const found = await locate(deps, command, now);
    if (!found.ok) return found;
    const { conversation, opened } = found.value;

    // Claimed before the message is written, and scoped to the uploader: an id
    // that does not exist, belongs to somebody else, or is already on another
    // message is refused here rather than becoming a broken image in a thread.
    // The check is part of the write, so two requests racing one id cannot both
    // win — see `AttachmentStorage.attach`.
    if (attachmentId !== null) {
      const claimed = await deps.attachments.attach(
        attachmentId,
        conversation.id,
        command.authorId,
      );
      if (!claimed) return err(SupportErrors.attachmentUnavailable());
    }

    const message = Message.create({
      id: deps.ids.next(),
      conversationId: conversation.id,
      userId: conversation.userId,
      author: command.author,
      authorId: command.authorId,
      body,
      attachmentId,
      sentAt: now,
    });

    // The message first, then the summary. If the second write fails the thread
    // shows a stale preview, which is a cosmetic fault an operator can still act
    // on. The other order loses the message and shows a preview of it, which is
    // the worst of both.
    await deps.messages.append(message);
    conversation.recordMessage(message);
    await deps.conversations.save(conversation);

    await announce(deps, conversation, message, opened);

    return ok({
      conversation: toConversationDto(conversation),
      message: toMessageDto(message),
      opened,
    });
  };
}

/**
 * Finds the thread this message belongs to, creating one where that is allowed.
 *
 * The authority check lives here because it is the same check in three shapes: an
 * operator addressing a thread by id, a customer addressing their own by id, and a
 * customer addressing the one they have open.
 */
async function locate(
  deps: SupportDependencies,
  command: PostMessageCommand,
  now: Date,
): Promise<Result<{ conversation: Conversation; opened: boolean }, SupportError>> {
  if (command.conversationId !== undefined) {
    const conversation = await deps.conversations.find(command.conversationId);
    if (conversation === null) {
      return err(SupportErrors.conversationNotFound(command.conversationId));
    }

    // Not-found rather than forbidden for a thread that exists but is not theirs.
    // Telling a caller which of their guessed ids was real is the first thing worth
    // knowing if you are enumerating other people's support threads.
    if (command.author === 'customer' && !conversation.belongsTo(command.authorId)) {
      return err(SupportErrors.conversationNotFound(command.conversationId));
    }

    return ok({ conversation, opened: false });
  }

  if (command.author === 'operator') {
    // An operator cannot start a thread. A support conversation a customer never
    // opened is a message arriving from nowhere, in a transcript they can read.
    return err(SupportErrors.conversationNotFound('(none supplied)'));
  }

  const existing = await deps.conversations.findOpenForUser(command.authorId);
  if (existing !== null) return ok({ conversation: existing, opened: false });

  const conversation = Conversation.open({
    id: deps.ids.next(),
    userId: command.userId ?? command.authorId,
    // Derived from what they wrote. See `subjectFrom` for why the widget does not
    // ask for one.
    subject: subjectFrom(command.body),
    at: now,
  });
  await deps.conversations.create(conversation);

  return ok({ conversation, opened: true });
}

/** Tells whoever did not send it. Never throws — see the port. */
async function announce(
  deps: SupportDependencies,
  conversation: Conversation,
  message: Message,
  opened: boolean,
): Promise<void> {
  const preview = summaryOf(message.snapshot(), 140);

  if (message.author === 'customer') {
    await deps.push.notify({
      audience: 'operators',
      title: opened ? 'New support conversation' : 'New message from a customer',
      body: preview,
      conversationId: conversation.id,
    });
    return;
  }

  await deps.push.notify({
    audience: { userId: conversation.userId },
    title: 'Novex support replied',
    body: preview,
    conversationId: conversation.id,
  });
}
