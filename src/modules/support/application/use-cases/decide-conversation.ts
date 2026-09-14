import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { ConversationPriority } from '../../domain/conversation';
import { SupportErrors, type SupportError } from '../../domain/errors';
import { Message } from '../../domain/message';
import { toConversationDto, type ConversationDto } from '../dto';
import type { SupportDependencies } from '../ports';

/**
 * The operator-side transitions: claim it, prioritise it, close it, mark it read.
 *
 * ── Claiming and resolving write a line into the thread ────────────────────────
 * A transcript that jumps from a customer's question to a resolved badge with
 * nothing in between is one nobody can reconstruct later — least of all the
 * customer, who can read it. So both actions append a `system` message, which is
 * exactly what that author exists for: a line no person typed, attributed to no
 * person.
 *
 * Setting a priority does not. It is an internal triage judgement, it changes
 * nothing the customer experiences, and a transcript reading "Lena set this to
 * urgent" tells them their problem is worse than they thought.
 */

export type ConversationAction =
  | { readonly kind: 'claim' }
  | { readonly kind: 'resolve' }
  | { readonly kind: 'prioritise'; readonly priority: ConversationPriority }
  | { readonly kind: 'mark-read' };

export interface DecideConversationCommand {
  readonly conversationId: string;
  readonly operatorId: UserId;
  readonly action: ConversationAction;
}

export type DecideConversation = (
  command: DecideConversationCommand,
) => Promise<Result<ConversationDto, SupportError>>;

export function createDecideConversation(deps: SupportDependencies): DecideConversation {
  return async function decideConversation(command) {
    const conversation = await deps.conversations.find(command.conversationId);
    if (conversation === null) {
      return err(SupportErrors.conversationNotFound(command.conversationId));
    }

    const now = deps.clock.now();
    let note: string | null = null;

    switch (command.action.kind) {
      case 'claim':
        // Claiming one somebody else holds is allowed. A shift ends, an agent goes
        // offline, and a thread nobody can take over is a customer waiting on a
        // person who has gone home.
        conversation.assign(command.operatorId);
        note = 'An agent picked up this conversation.';
        break;

      case 'resolve':
        conversation.resolve(command.operatorId, now);
        note = 'This conversation was marked resolved. Reply here to reopen it.';
        break;

      case 'prioritise':
        conversation.setPriority(command.action.priority);
        break;

      case 'mark-read':
        conversation.markRead('operator');
        break;
    }

    if (note !== null) {
      const message = Message.create({
        id: deps.ids.next(),
        conversationId: conversation.id,
        userId: conversation.userId,
        author: 'system',
        authorId: null,
        body: note,
        sentAt: now,
      });
      await deps.messages.append(message);
      // Folded in after the transition, so the preview shows the note and the
      // unread counters stay put — `recordMessage` credits a system line to nobody.
      conversation.recordMessage(message);
    }

    await deps.conversations.save(conversation);

    // Resolving is worth a push: it is the one operator action a customer is
    // waiting on. Claiming is not — "someone is looking at it" arriving as a phone
    // notification is noise, and the thread already shows it.
    if (command.action.kind === 'resolve') {
      await deps.push.notify({
        audience: { userId: conversation.userId },
        title: 'Your support conversation was resolved',
        body: conversation.snapshot().subject,
        conversationId: conversation.id,
      });
    }

    return ok(toConversationDto(conversation));
  };
}
