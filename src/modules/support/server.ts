import 'server-only';

/**
 * Server-side entry point for the support module.
 *
 *   `@/modules/support`        types, DTOs, limits — safe anywhere
 *   `@/modules/support/server` composition, which touches Firebase
 */

export type { SupportModule, RegisterSupportOptions } from './module';
export { registerSupport } from './module';

export {
  countOpenConversations,
  getOwnThread,
  getThread,
  listConversations,
} from './application/queries/conversations';

export type { PostMessageCommand } from './application/use-cases/post-message';
export type {
  ConversationAction,
  DecideConversationCommand,
} from './application/use-cases/decide-conversation';

export type { DeviceRegistration } from './application/ports';
