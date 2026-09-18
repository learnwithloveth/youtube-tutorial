import 'server-only';

import { and, eq, isNull, lt } from 'drizzle-orm';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import type { AttachmentContentType } from '../../domain/attachment';
import type { AttachmentStorage, StoredAttachment } from '../../application/ports';

import { attachments } from './schema';

/**
 * Attachment bytes, in Postgres.
 *
 * ── Two writes, not one transaction ────────────────────────────────────────────
 * The image is stored first and the message that references it is written second,
 * into a different database. There is no transaction spanning the two and there
 * cannot be, so the order is chosen for which failure is survivable: an orphaned
 * image nobody sees, or a message pointing at an image that was never stored.
 *
 * The first is a row a sweep can find — see `deleteOrphansBefore`. The second is a
 * broken thread in front of a customer.
 */
export class PostgresAttachmentStorage implements AttachmentStorage {
  constructor(private readonly db: Database) {}

  async put(input: {
    id: string;
    userId: UserId;
    bytes: Uint8Array;
    contentType: AttachmentContentType;
  }): Promise<void> {
    await this.db.insert(attachments).values({
      id: input.id,
      conversationId: null,
      userId: input.userId,
      contentType: input.contentType,
      bytes: input.bytes,
      byteLength: input.bytes.byteLength,
    });
  }

  async get(id: string): Promise<StoredAttachment | null> {
    const rows = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    return {
      id: row.id,
      userId: row.userId as UserId,
      conversationId: row.conversationId,
      customerId: (row.customerId as UserId | null) ?? null,
      contentType: row.contentType,
      bytes: row.bytes,
      byteLength: row.byteLength,
    };
  }

  async attach(input: {
    id: string;
    conversationId: string;
    uploadedBy: UserId;
    customerId: UserId;
  }): Promise<boolean> {
    // Scoped to the uploader and to a row not already claimed. That is the check
    // that stops one customer attaching another's image to their own thread by
    // guessing an id — done as part of the write rather than as a read beforehand,
    // so two requests racing the same id cannot both win.
    //
    // The customer is written in the same statement: an attachment that is claimed
    // but has no owner recorded would be one the customer could not open.
    const claimed = await this.db
      .update(attachments)
      .set({ conversationId: input.conversationId, customerId: input.customerId })
      .where(
        and(
          eq(attachments.id, input.id),
          eq(attachments.userId, input.uploadedBy),
          isNull(attachments.conversationId),
        ),
      )
      .returning({ id: attachments.id });

    return claimed.length > 0;
  }

  async deleteOrphansBefore(cutoff: Date, limit: number): Promise<number> {
    // An upload that never became a message: somebody picked a file and closed the
    // widget. Bounded per call so one invocation cannot hold a lock for an
    // unbounded time, matching the activity sweep.
    const ids = await this.db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(isNull(attachments.conversationId), lt(attachments.uploadedAt, cutoff)))
      .limit(limit);

    if (ids.length === 0) return 0;

    let removed = 0;
    for (const row of ids) {
      await this.db.delete(attachments).where(eq(attachments.id, row.id));
      removed += 1;
    }
    return removed;
  }
}
