/**
 * support — public API, safe to import anywhere.
 *
 * Types, DTOs and the limits a textarea needs. Composition lives in `./server`,
 * which is `server-only`.
 *
 * The split is not a style choice. A barrel is imported *whole*, so exporting
 * `registerSupport` from here would drag `firebase-admin` — and with it a service
 * account credential's code path — into any Client Component that wanted a
 * `MessageDto`. The build would fail, correctly, and this is the file that stops
 * anyone having to find out why.
 */

export type { ConversationDto, MessageDto } from './application/dto';

export type {
  ConversationPriority,
  ConversationStatus,
} from './domain/conversation';
export { MAX_SUBJECT_LENGTH } from './domain/conversation';

export type { MessageAuthor } from './domain/message';
export { MAX_MESSAGE_LENGTH } from './domain/message';

export type {
  AttachmentContentType,
  AttachmentRejection,
} from './domain/attachment';
export {
  inspectAttachment,
  MAX_ATTACHMENT_BYTES,
  presentAttachmentRejection,
} from './domain/attachment';

export type { SupportError } from './domain/errors';
export { presentSupportError } from './domain/errors';

/*
 * The queries are NOT re-exported here. They log, and the logger is `server-only`
 * — the same trap `presence`, `activity` and `ledger` all document. They live in
 * `./server`.
 */
export type {
  ConversationListDto,
  ThreadDto,
} from './application/queries/conversations';
