import { PRESENCE_RETENTION_MS } from '../../domain/presence';
import type { PresenceDependencies } from '../ports';

/**
 * Deletes presence rows past their retention window.
 *
 * ── Retention, not housekeeping ────────────────────────────────────────────────
 * This is not a cache eviction that can be skipped when nobody is looking. A
 * presence row holds a coarse location, a route and a keyed address digest for a
 * named account — personal data whose only justification is answering "who is here
 * *now*". Six hours after a tab went quiet there is no such justification left, so
 * the row is deleted rather than archived.
 *
 * Bounded per call so one invocation cannot lock a table for an unbounded time.
 * The caller repeats or waits for the next trigger; falling behind for a few
 * minutes is fine, and a statement that never returns is not.
 */
export function createSweepPresence(deps: PresenceDependencies) {
  return async function sweepPresence(limit = 500): Promise<number> {
    const before = new Date(deps.clock.now().getTime() - PRESENCE_RETENTION_MS);
    return deps.presences.deleteExpired(before, limit);
  };
}

export type SweepPresence = ReturnType<typeof createSweepPresence>;
