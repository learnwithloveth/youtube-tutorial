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
 *  - Anyone may write to their own thread, and opening one is implicit: with no
 *    open conversation, this creates it.
 *  - An operator may additionally write to *somebody else's* thread, and may not
 *    create one for them. A support thread a customer never started is a message
 *    arriving from nowhere, in a transcript they can read.
 *
 * ── The part is decided by the thread, not by the account ─────────────────────
 * `role` says what the caller is allowed to do; `author` says which part they are
 * playing in this particular conversation, and they are not the same question. An
 * operator is also a person with an account, and when they write in their *own*
 * thread they are the customer in it.
 *
 * Conflating the two is a bug this had: the role alone decided the author, so an
 * operator opening the customer widget was refused with "that conversation is no
 * longer available" on every message. They had no thread, the operator branch
 * would not open one, and the error for "you named no conversation" is the same
 * error as "that conversation is not yours".
 *
 * ── Why the push is awaited but cannot fail ────────────────────────────────────
 * `notify` is best-effort by contract. The message is already written by the time
 * it runs, so a failure there costs a notification, not a conversation — and the
 * alternative, letting it reject, would turn an unreachable phone into a customer
 * seeing their question fail to send.
 */

export interface PostMessageCommand {
  /**
   * Omitted when the caller means their own thread, whoever they are.
   *
   * An operator replying to a customer names the thread; anybody writing about
   * their own account does not have one to name, and this opens it.
   */
  readonly conversationId?: string | undefined;
  /**
   * What the caller is *allowed* to do, straight from their account.
   *
   * Not which part they play — see `locate`. This used to be `author`, decided by
   * the route, and that is precisely what broke: an operator has a support thread
   * like everybody else, and naming them the operator in it made it unreachable.
   */
  readonly role: 'customer' | 'operator';
  readonly authorId: UserId;
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
    const { conversation, opened, author } = found.value;

    // Claimed before the message is written, and scoped to the uploader: an id
    // that does not exist, belongs to somebody else, or is already on another
    // message is refused here rather than becoming a broken image in a thread.
    // The check is part of the write, so two requests racing one id cannot both
    // win — see `AttachmentStorage.attach`.
    if (attachmentId !== null) {
      const claimed = await deps.attachments.attach({
        id: attachmentId,
        conversationId: conversation.id,
        uploadedBy: command.authorId,
        // The thread's customer, which is the author only when a customer is
        // writing. An operator's image belongs to the conversation they sent it
        // to, and that is who has to be able to open it.
        customerId: conversation.userId,
      });
      if (!claimed) return err(SupportErrors.attachmentUnavailable());
    }

    const message = Message.create({
      id: deps.ids.next(),
      conversationId: conversation.id,
      userId: conversation.userId,
      // The part played in *this* thread, which the locator worked out from whose
      // thread it is. An operator writing in their own is a customer in it.
      author,
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
 * Finds the thread this message belongs to, creating one where that is allowed,
 * and works out which part the caller is playing in it.
 *
 * The authority check lives here because it is the same check in three shapes: an
 * operator addressing somebody else's thread by id, anybody addressing their own
 * by id, and anybody addressing the one they have open.
 *
 * ── Own thread beats role, every time ─────────────────────────────────────────
 * A thread that belongs to the caller makes them the customer in it whatever their
 * account says, so an operator can use the support widget like anybody else. Only
 * a thread that is *not* theirs puts them in the operator's chair — which is the
 * one case where the role has to be checked at all.
 */
async function locate(
  deps: SupportDependencies,
  command: PostMessageCommand,
  now: Date,
): Promise<
  Result<
    { conversation: Conversation; opened: boolean; author: 'customer' | 'operator' },
    SupportError
  >
> {
  if (command.conversationId !== undefined) {
    const conversation = await deps.conversations.find(command.conversationId);
    if (conversation === null) {
      return err(SupportErrors.conversationNotFound(command.conversationId));
    }

    if (conversation.belongsTo(command.authorId)) {
      return ok({ conversation, opened: false, author: 'customer' });
    }

    // Not-found rather than forbidden for a thread that exists but is not theirs.
    // Telling a caller which of their guessed ids was real is the first thing worth
    // knowing if you are enumerating other people's support threads.
    if (command.role !== 'operator') {
      return err(SupportErrors.conversationNotFound(command.conversationId));
    }

    return ok({ conversation, opened: false, author: 'operator' });
  }

  // No conversation named, so this is about the caller's own account — the only
  // thread anybody can mean without naming one. An operator lands here too, and
  // that is the fix: the rule they used to hit was meant to stop them opening a
  // thread *for a customer*, not to stop them having one.
  const existing = await deps.conversations.findOpenForUser(command.authorId);
  if (existing !== null) {
    return ok({ conversation: existing, opened: false, author: 'customer' });
  }

  const conversation = Conversation.open({
    id: deps.ids.next(),
    userId: command.authorId,
    // Derived from what they wrote. See `subjectFrom` for why the widget does not
    // ask for one.
    subject: subjectFrom(command.body),
    at: now,
  });
  await deps.conversations.create(conversation);

  return ok({ conversation, opened: true, author: 'customer' });
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
      link: `/admin/support?conversation=${encodeURIComponent(conversation.id)}`,
      tag: `support-${conversation.id}`,
      surface: 'support-queue',
    });
    return;
  }

  await deps.push.notify({
    audience: { userId: conversation.userId },
    title: `${deps.siteName} support replied`,
    body: preview,
    link: '/app',
    tag: `support-${conversation.id}`,
    surface: 'support-thread',
  });
}
