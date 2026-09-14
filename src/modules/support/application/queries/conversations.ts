import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { ConversationStatus } from '../../domain/conversation';
import { toConversationDto, toMessageDto, type ConversationDto, type MessageDto } from '../dto';
import type { SupportDependencies } from '../ports';

/**
 * The console's reads.
 *
 * ── These exist even though the browser subscribes directly ────────────────────
 * The support page renders on the server first and only then attaches a Firestore
 * listener. Without that, an operator opening the console watches an empty panel
 * until the SDK loads, authenticates and completes its first snapshot — which is
 * two round trips and a bundle parse on a screen that is supposed to feel live.
 *
 * So the server renders what it can already see and the listener takes over. The
 * page is correct before any JavaScript runs, and stays correct after.
 */

export interface ConversationListDto {
  readonly conversations: readonly ConversationDto[];
  /** True when the read failed. An empty inbox and an unreachable one differ. */
  readonly degraded: boolean;
}

export interface ThreadDto {
  readonly conversation: ConversationDto | null;
  readonly messages: readonly MessageDto[];
  readonly degraded: boolean;
}

const DEFAULT_LIMIT = 40;
const MAX_MESSAGES = 200;

export async function listConversations(
  deps: SupportDependencies,
  options: {
    status?: ConversationStatus | undefined;
    assignedTo?: UserId | undefined;
    limit?: number | undefined;
  } = {},
): Promise<ConversationListDto> {
  try {
    const conversations = await deps.conversations.list({
      status: options.status,
      assignedTo: options.assignedTo,
      limit: Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 100),
    });

    return { conversations: conversations.map(toConversationDto), degraded: false };
  } catch (error) {
    logger.error({ event: 'support_list_failed', module: 'support' }, error);
    return { conversations: [], degraded: true };
  }
}

/**
 * One thread, with its transcript.
 *
 * `requiredUserId` is the authority check, not a filter: a customer asking for a
 * thread that is not theirs gets the same answer as one asking for a thread that
 * does not exist.
 */
export async function getThread(
  deps: SupportDependencies,
  conversationId: string,
  requiredUserId?: UserId | undefined,
): Promise<ThreadDto> {
  try {
    const conversation = await deps.conversations.find(conversationId);
    if (conversation === null) return { conversation: null, messages: [], degraded: false };

    if (requiredUserId !== undefined && !conversation.belongsTo(requiredUserId)) {
      return { conversation: null, messages: [], degraded: false };
    }

    const messages = await deps.messages.list(conversationId, MAX_MESSAGES);

    return {
      conversation: toConversationDto(conversation),
      messages: messages.map(toMessageDto),
      degraded: false,
    };
  } catch (error) {
    logger.error({ event: 'support_thread_failed', module: 'support', conversationId }, error);
    return { conversation: null, messages: [], degraded: true };
  }
}

/** The customer's own thread, for the widget's first paint. */
export async function getOwnThread(
  deps: SupportDependencies,
  userId: UserId,
): Promise<ThreadDto> {
  try {
    const conversation = await deps.conversations.findOpenForUser(userId);
    if (conversation === null) return { conversation: null, messages: [], degraded: false };

    return getThread(deps, conversation.id, userId);
  } catch (error) {
    logger.error({ event: 'support_own_thread_failed', module: 'support', userId }, error);
    return { conversation: null, messages: [], degraded: true };
  }
}

/** Open threads, for the rail badge. Degrades to zero — a badge is not worth a 500. */
export async function countOpenConversations(deps: SupportDependencies): Promise<number> {
  try {
    return await deps.conversations.countOpen();
  } catch (error) {
    logger.warn({ event: 'support_count_failed', module: 'support' }, error);
    return 0;
  }
}
