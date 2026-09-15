import { EPHEMERAL_KINDS, SECURITY_RETENTION_MS, SHORT_RETENTION_MS } from '../../domain/event';
import type { ActivityDependencies } from '../ports';

/**
 * Deletes events past the retention window for their kind.
 *
 * Two cut-offs, not one, because the two kinds of record are kept for different
 * lengths — see `retentionMsFor`. A single window would force the choice between
 * discarding sign-in history that matters a year later and keeping a browsing
 * history that stopped being useful in a month.
 *
 * Bounded per call so one invocation cannot lock a table for an unbounded time.
 * Falling behind for a few minutes is fine; a statement that never returns is not.
 */
export function createSweepActivity(deps: ActivityDependencies) {
  return async function sweepActivity(limit = 1_000): Promise<number> {
    const now = deps.clock.now().getTime();

    return deps.events.deleteExpired(
      {
        ephemeralKinds: EPHEMERAL_KINDS,
        ephemeral: new Date(now - SHORT_RETENTION_MS),
        security: new Date(now - SECURITY_RETENTION_MS),
      },
      limit,
    );
  };
}

export type SweepActivity = ReturnType<typeof createSweepActivity>;
