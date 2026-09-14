import 'server-only';

import { and, asc, count, desc, eq, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Database } from '@/platform/db/client';
import type { UserId } from '@/shared/kernel/ids';

import {
  IdentityVerification,
  type DocumentContentType,
  type IdentityDocumentType,
  type VerificationStatus,
} from '../../domain/identity-verification';
import type { DocumentStorage, VerificationRepository } from '../../application/ports';
import { verificationDocuments, verifications, type VerificationRow } from './schema';

/**
 * Verification submissions in Postgres.
 *
 * ── Insert-or-update on the id, with a version guard ──────────────────────────
 * Same shape as the ledger's aggregates. `save` is called both to create and to
 * record a decision, and the version check is what makes two operators clicking
 * Approve on the same case at the same moment resolve to one decision rather than
 * the later one silently replacing the earlier — including the reason a customer
 * has already been shown.
 */
export class DrizzleVerificationRepository implements VerificationRepository {
  constructor(private readonly db: Database) {}

  nextId(): string {
    return randomUUID();
  }

  async save(verification: IdentityVerification): Promise<void> {
    const snapshot = verification.snapshot();

    const row = {
      id: snapshot.id,
      userId: snapshot.userId,
      fullName: snapshot.fullName,
      dateOfBirth: snapshot.dateOfBirth,
      country: snapshot.country,
      documentType: snapshot.documentType,
      documentNumber: snapshot.documentNumber,
      documentId: snapshot.documentId,
      status: snapshot.status,
      submittedAt: snapshot.submittedAt,
      decidedAt: snapshot.decidedAt,
      decidedBy: snapshot.decidedBy,
      reason: snapshot.reason,
    };

    await this.db
      .insert(verifications)
      .values(row)
      .onConflictDoUpdate({
        target: verifications.id,
        set: {
          status: row.status,
          decidedAt: row.decidedAt,
          decidedBy: row.decidedBy,
          reason: row.reason,
        },
        /*
         * Only a still-pending row may be decided.
         *
         * Expressed as a `where` on the write rather than a read-then-write,
         * because the gap between reading "pending" and writing "approved" is
         * exactly where the second operator's click lands.
         */
        where: eq(verifications.status, 'pending'),
      });
  }

  async find(id: string): Promise<IdentityVerification | null> {
    const [row] = await this.db
      .select()
      .from(verifications)
      .where(eq(verifications.id, id))
      .limit(1);
    return row === undefined ? null : toDomain(row);
  }

  async hasPending(userId: UserId): Promise<boolean> {
    const [row] = await this.db
      .select({ id: verifications.id })
      .from(verifications)
      .where(and(eq(verifications.userId, userId), eq(verifications.status, 'pending')))
      .limit(1);
    return row !== undefined;
  }

  async listForUser(userId: UserId, limit: number): Promise<IdentityVerification[]> {
    const rows = await this.db
      .select()
      .from(verifications)
      .where(eq(verifications.userId, userId))
      .orderBy(desc(verifications.submittedAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async listPending(limit: number): Promise<IdentityVerification[]> {
    const rows = await this.db
      .select()
      .from(verifications)
      .where(eq(verifications.status, 'pending'))
      // Oldest first. A review queue is worked in the order people joined it, which
      // is the opposite of every history feed in this codebase.
      .orderBy(asc(verifications.submittedAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async listRecentlyDecided(limit: number): Promise<IdentityVerification[]> {
    const rows = await this.db
      .select()
      .from(verifications)
      .where(isNotNull(verifications.decidedAt))
      .orderBy(desc(verifications.decidedAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async countByStatus(): Promise<{ status: VerificationStatus; total: number }[]> {
    const rows = await this.db
      .select({ status: verifications.status, total: count() })
      .from(verifications)
      .groupBy(verifications.status);
    return rows.map((row) => ({ status: row.status, total: Number(row.total) }));
  }
}

/**
 * Documents as `bytea`.
 *
 * The same trade-off, and the same exit, as the ledger's proof storage: no
 * credentials to manage and transactional with the row that references it, at the
 * cost of a 512 MB database holding multi-megabyte photographs. When that stops
 * being acceptable this class is replaced by an S3 adapter with presigned uploads
 * and nothing above the port changes.
 */
export class PostgresDocumentStorage implements DocumentStorage {
  constructor(private readonly db: Database) {}

  async put(bytes: Uint8Array, contentType: DocumentContentType): Promise<string> {
    const id = randomUUID();
    await this.db.insert(verificationDocuments).values({
      id,
      contentType,
      bytes,
      byteLength: bytes.byteLength,
    });
    return id;
  }

  async get(
    documentId: string,
  ): Promise<{ bytes: Uint8Array; contentType: DocumentContentType } | null> {
    const [row] = await this.db
      .select({
        bytes: verificationDocuments.bytes,
        contentType: verificationDocuments.contentType,
      })
      .from(verificationDocuments)
      .where(eq(verificationDocuments.id, documentId))
      .limit(1);

    return row === undefined ? null : { bytes: row.bytes, contentType: row.contentType };
  }
}

function toDomain(row: VerificationRow): IdentityVerification {
  return IdentityVerification.rehydrate({
    id: row.id,
    userId: row.userId as UserId,
    fullName: row.fullName,
    // `date` comes back as `YYYY-MM-DD`, which is the shape the domain stores.
    dateOfBirth: row.dateOfBirth,
    country: row.country,
    documentType: row.documentType as IdentityDocumentType,
    documentNumber: row.documentNumber,
    documentId: row.documentId,
    status: row.status,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy as UserId | null,
    reason: row.reason,
  });
}
