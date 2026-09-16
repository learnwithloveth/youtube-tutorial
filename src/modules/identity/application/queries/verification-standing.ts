import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { IdentityDependencies } from '../ports';

/**
 * Where one customer stands on identity verification, as their own account shows it.
 *
 * ── Read from the history, not stored as a flag ───────────────────────────────
 * A submission is immutable once decided, and a customer who was refused submits
 * again as a new row. So "where do I stand" is a reading of the newest rows rather
 * than a field somebody has to remember to update. An approval anywhere in the
 * history wins: nothing can be submitted after one.
 *
 * ── The reason reaches the customer here ──────────────────────────────────────
 * A rejection must carry a reason precisely so the person refused can act on it.
 * The activity trail leaves the reason out on purpose, so this read is the only
 * place a customer ever sees it.
 *
 * ── Unavailable is a state, not an exception ──────────────────────────────────
 * A failed read must not show as "unverified". That would invite a second
 * submission of a document already in the queue. It reports that it could not be
 * read, the same way a limit that could not be fetched is not a limit of zero.
 */

export type VerificationStandingDto =
  | { readonly state: 'unverified' }
  | { readonly state: 'pending'; readonly submittedAt: string }
  | { readonly state: 'approved'; readonly decidedAt: string | null }
  | {
      readonly state: 'rejected';
      readonly decidedAt: string | null;
      readonly reason: string | null;
    }
  | { readonly state: 'unavailable' };

/** The same window the submit use case searches for an earlier approval. */
const HISTORY_LIMIT = 20;

export async function getVerificationStanding(
  deps: IdentityDependencies,
  userId: UserId,
): Promise<VerificationStandingDto> {
  try {
    const history = await deps.verifications.listForUser(userId, HISTORY_LIMIT);

    const approved = history.find((entry) => entry.status === 'approved');
    if (approved !== undefined) {
      return {
        state: 'approved',
        decidedAt: approved.snapshot().decidedAt?.toISOString() ?? null,
      };
    }

    // Newest first, so this is the submission the customer last made.
    const latest = history[0];
    if (latest === undefined) return { state: 'unverified' };

    const snapshot = latest.snapshot();
    if (snapshot.status === 'pending') {
      return { state: 'pending', submittedAt: snapshot.submittedAt.toISOString() };
    }

    return {
      state: 'rejected',
      decidedAt: snapshot.decidedAt?.toISOString() ?? null,
      reason: snapshot.reason,
    };
  } catch (error) {
    logger.error({ event: 'verification_standing_read_failed', module: 'identity' }, error);
    return { state: 'unavailable' };
  }
}
