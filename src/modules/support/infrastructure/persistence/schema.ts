import { customType, index, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The one table the support module owns in Postgres.
 *
 * ── Why this module has two stores ─────────────────────────────────────────────
 * Conversations and messages are in Firestore, because a reply has to appear while
 * somebody is waiting for it and a serverless deployment cannot hold a socket open
 * to make that happen. Attachments have no such requirement — an image is written
 * once and read a handful of times — so they live here, in the same database as
 * everything else, under the same authorised-route pattern as a deposit proof.
 *
 * That is the ports-and-adapters arrangement doing what it is for: the use cases
 * do not know that two different technologies are behind them, and the split is
 * one line in `module.ts`.
 *
 * ── No foreign key to the conversation ─────────────────────────────────────────
 * There cannot be one: the conversation is a Firestore document, and Postgres has
 * nothing to point at. `conversation_id` is an opaque string, exactly as a
 * `user_id` is in every other module's schema — and the same discipline applies,
 * which is that nothing here reads across the boundary to interpret it.
 */

export const supportSchema = pgSchema('support');

/**
 * Attachment bytes.
 *
 * ── This is the table to move first ────────────────────────────────────────────
 * Postgres is a deliberate starting point, not the destination — the same note
 * `ledger.deposit_proofs` carries. It needs no credentials and it is transactional
 * with nothing, which is fine because an attachment is written before the message
 * that references it. It is also the wrong home at volume: this project's tier is
 * 512 MB in total, and a `bytea` column inflates every backup with data that is
 * written once.
 *
 * Past a few hundred images, `AttachmentStorage` gets an object-storage adapter
 * and this table is dropped — which is the whole reason it sits behind a port.
 */
export const attachments = supportSchema.table(
  'attachments',
  {
    id: text('id').primaryKey(),

    /** The Firestore conversation this belongs to. Null until the message is sent. */
    conversationId: text('conversation_id'),
    /**
     * Opaque `UserId` of whoever uploaded it. Scopes the claim in `attach`, so
     * nobody can bind somebody else's upload to their own thread.
     */
    userId: text('user_id').notNull(),
    /**
     * The customer whose conversation this ended up in. Null until it is claimed.
     *
     * ── Why this is not the same as `user_id` ─────────────────────────────────
     * Both sides of a conversation send images, so the uploader is the customer
     * for some rows and an operator for others. Serving the bytes asks a different
     * question from claiming them — not "did you upload this" but "is this in your
     * conversation" — and answering it from `user_id` meant an operator's image was
     * refused to the only customer entitled to see it.
     *
     * Recorded here rather than looked up, because the conversation lives in
     * Firestore: authorising by reading it would be a document read on every
     * render of every image, on a database billed by the document. The claim
     * already knows the answer, so it writes it down.
     */
    customerId: text('customer_id'),

    /** Sniffed from the bytes, never taken from the upload's declared type. */
    contentType: text('content_type', {
      enum: ['image/png', 'image/jpeg', 'image/webp'],
    }).notNull(),

    bytes: customType<{ data: Uint8Array; driverData: Buffer }>({
      dataType: () => 'bytea',
      toDriver: (value) => Buffer.from(value),
      fromDriver: (value) => new Uint8Array(value),
    })('bytes').notNull(),

    byteLength: integer('byte_length').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Finding an abandoned upload: one that was stored and never attached to a
    // message. A sweep needs them by age, not by owner.
    index('attachments_uploaded_idx').on(table.uploadedAt),
    // Everything one customer has ever attached, for an account-deletion path.
    index('attachments_user_idx').on(table.userId),
  ],
);

export type AttachmentRow = typeof attachments.$inferSelect;
