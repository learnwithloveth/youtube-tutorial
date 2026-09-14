import { logger } from '@/platform/observability/logger';

import type {
  IdentityDocumentType,
  IdentityVerification,
  VerificationStatus,
} from '../../domain/identity-verification';
import type { IdentityDependencies } from '../ports';

/**
 * What the KYC review console reads.
 *
 * ── Every field here is something somebody typed or uploaded ──────────────────
 * There is no `checks` array, no confidence score and no sanctions result, because
 * this platform runs none of those. The screen this replaced showed five automated
 * checks with green PASS badges — document authenticity, face match, liveness,
 * address, sanctions & PEP — all from a fixture, against no vendor, no model and no
 * screening list. That is not a missing integration, it is a false statement on a
 * compliance record, and the safest possible version of it is its absence.
 *
 * ── Degradation is a value, not an exception ──────────────────────────────────
 * A console page that throws renders an error boundary, and an operator cannot tell
 * "no cases waiting" from "the queue could not be read". `degraded` makes the page
 * say which.
 */

export interface VerificationSummaryDto {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly country: string;
  readonly documentType: IdentityDocumentType;
  readonly documentNumber: string;
  readonly status: VerificationStatus;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly reason: string | null;
}

export interface VerificationQueueDto {
  readonly pending: readonly VerificationSummaryDto[];
  readonly decided: readonly VerificationSummaryDto[];
  readonly counts: Readonly<Record<VerificationStatus, number>>;
  readonly degraded: boolean;
}

const EMPTY: VerificationQueueDto = {
  pending: [],
  decided: [],
  counts: { pending: 0, approved: 0, rejected: 0 },
  degraded: true,
};

export async function getVerificationQueue(
  deps: IdentityDependencies,
  options: { pendingLimit?: number; decidedLimit?: number } = {},
): Promise<VerificationQueueDto> {
  try {
    const [pending, decided, tallies] = await Promise.all([
      deps.verifications.listPending(options.pendingLimit ?? 50),
      deps.verifications.listRecentlyDecided(options.decidedLimit ?? 20),
      deps.verifications.countByStatus(),
    ]);

    const counts: Record<VerificationStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const tally of tallies) counts[tally.status] = tally.total;

    return {
      pending: pending.map(toSummary),
      decided: decided.map(toSummary),
      counts,
      degraded: false,
    };
  } catch (error) {
    logger.error({ event: 'verification_queue_read_failed', module: 'identity' }, error);
    return EMPTY;
  }
}

/** One submission in full, for the detail panel and the document route. */
export async function getVerification(
  deps: IdentityDependencies,
  id: string,
): Promise<VerificationSummaryDto | null> {
  try {
    const found = await deps.verifications.find(id);
    return found === null ? null : toSummary(found);
  } catch (error) {
    logger.error({ event: 'verification_read_failed', module: 'identity', id }, error);
    return null;
  }
}

function toSummary(verification: IdentityVerification): VerificationSummaryDto {
  const snapshot = verification.snapshot();
  return {
    id: snapshot.id,
    userId: snapshot.userId,
    fullName: snapshot.fullName,
    dateOfBirth: snapshot.dateOfBirth,
    country: snapshot.country,
    documentType: snapshot.documentType,
    documentNumber: snapshot.documentNumber,
    status: snapshot.status,
    submittedAt: snapshot.submittedAt.toISOString(),
    decidedAt: snapshot.decidedAt?.toISOString() ?? null,
    decidedBy: snapshot.decidedBy,
    reason: snapshot.reason,
  };
}
