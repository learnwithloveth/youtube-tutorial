import { MAX_MESSAGE_LENGTH } from './message';

/**
 * Failures this context returns as values.
 *
 * Every one is something the person on the other end can act on, and every one is
 * sayable out loud. Anything that is merely a bug — a message that reached the
 * entity without passing validation — throws instead.
 */
export type SupportError =
  | { readonly kind: 'message-empty' }
  | { readonly kind: 'message-too-long'; readonly max: number }
  /**
   * Covers both "no such conversation" and "not yours".
   *
   * One error for two conditions, deliberately. Distinguishing them tells a caller
   * guessing ids which of their guesses was real, which is the first thing worth
   * knowing if you are enumerating other people's support threads. The console
   * answers 404 for the same reason the rest of it does.
   */
  | { readonly kind: 'conversation-not-found'; readonly id: string }
  /**
   * The referenced image cannot be attached.
   *
   * One error for several conditions — no such upload, somebody else's, or already
   * on another message — for the reason `conversation-not-found` collapses two:
   * distinguishing them tells a caller guessing ids which guesses were real.
   */
  | { readonly kind: 'attachment-unavailable' }
  /** No Firebase project is configured. A state, not a fault — see the module. */
  | { readonly kind: 'support-unavailable' };

export const SupportErrors = {
  messageEmpty: (): SupportError => ({ kind: 'message-empty' }),
  messageTooLong: (): SupportError => ({ kind: 'message-too-long', max: MAX_MESSAGE_LENGTH }),
  conversationNotFound: (id: string): SupportError => ({ kind: 'conversation-not-found', id }),
  attachmentUnavailable: (): SupportError => ({ kind: 'attachment-unavailable' }),
  unavailable: (): SupportError => ({ kind: 'support-unavailable' }),
} as const;

/** What a person is shown. Never a code, never a stack, never "something went wrong". */
export function presentSupportError(error: SupportError): string {
  switch (error.kind) {
    case 'message-empty':
      return 'Write something first.';
    case 'message-too-long':
      return `That is longer than ${error.max.toLocaleString('en-US')} characters. Send it in a couple of parts.`;
    case 'conversation-not-found':
      return 'That conversation is no longer available.';
    case 'attachment-unavailable':
      return 'That image could not be attached. Try picking it again.';
    case 'support-unavailable':
      return 'Live chat is not available right now. Everything else on the platform is unaffected.';
  }
}
