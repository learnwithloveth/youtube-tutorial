import type { UserId } from '@/shared/kernel/ids';

import type {
  DocumentContentType,
  IdentityVerification,
  VerificationStatus,
} from '../../domain/identity-verification';
import type { DocumentStorage, VerificationRepository } from '../ports';

/**
 * In-memory verification ports.
 *
 * Shared by the identity tests rather than redeclared in each, so a rule that
 * changes — the queue's ordering, the decided-once guard — changes in one place and
 * every test that depends on it moves together.
 */
export class FakeVerifications implements VerificationRepository {
  readonly store = new Map<string, IdentityVerification>();
  private sequence = 0;

  nextId(): string {
    this.sequence += 1;
    return `ver_${this.sequence}`;
  }

  async save(verification: IdentityVerification): Promise<void> {
    this.store.set(verification.id, verification);
  }

  async find(id: string): Promise<IdentityVerification | null> {
    return this.store.get(id) ?? null;
  }

  async hasPending(userId: UserId): Promise<boolean> {
    return this.all().some((entry) => entry.userId === userId && entry.status === 'pending');
  }

  async listForUser(userId: UserId, limit: number): Promise<IdentityVerification[]> {
    return this.all()
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .slice(0, limit);
  }

  async listPending(limit: number): Promise<IdentityVerification[]> {
    // Oldest first, matching the adapter — a queue is worked in joining order.
    return this.all()
      .filter((entry) => entry.status === 'pending')
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
      .slice(0, limit);
  }

  async listRecentlyDecided(limit: number): Promise<IdentityVerification[]> {
    return this.all()
      .filter((entry) => entry.status !== 'pending')
      .sort(
        (a, b) =>
          (b.snapshot().decidedAt?.getTime() ?? 0) - (a.snapshot().decidedAt?.getTime() ?? 0),
      )
      .slice(0, limit);
  }

  async countByStatus(): Promise<{ status: VerificationStatus; total: number }[]> {
    const tally = new Map<VerificationStatus, number>();
    for (const entry of this.all()) {
      tally.set(entry.status, (tally.get(entry.status) ?? 0) + 1);
    }
    return [...tally].map(([status, total]) => ({ status, total }));
  }

  private all(): IdentityVerification[] {
    return [...this.store.values()];
  }
}

export class FakeDocuments implements DocumentStorage {
  readonly store = new Map<string, { bytes: Uint8Array; contentType: DocumentContentType }>();
  private sequence = 0;

  async put(bytes: Uint8Array, contentType: DocumentContentType): Promise<string> {
    this.sequence += 1;
    const id = `doc_${this.sequence}`;
    this.store.set(id, { bytes, contentType });
    return id;
  }

  async get(
    documentId: string,
  ): Promise<{ bytes: Uint8Array; contentType: DocumentContentType } | null> {
    return this.store.get(documentId) ?? null;
  }
}

/**
 * A minimal but *real* PNG header followed by filler.
 *
 * Real because the upload path sniffs the leading bytes and discards what the
 * client declared — a test that passed `new Uint8Array(200)` would be exercising
 * the rejection path while appearing to test the happy one.
 */
export function pngBytes(length = 512): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}
