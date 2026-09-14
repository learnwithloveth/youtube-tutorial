import { logger } from '@/platform/observability/logger';

import { SECURITY_KINDS, type ActivityKind } from '../../domain/event';
import { toActivityEventDto, type ActivityEventDto } from '../dto';
import type { ActivityRepository } from '../ports';

/**
 * The platform's audit trail.
 *
 * ── Security events by default, not page views ─────────────────────────────────
 * A trail that includes every page view is one nobody reads: the signal an audit
 * is opened for — a sign-in from a new country, a withdrawal approved, console
 * access withdrawn — is a rounding error next to the navigation. So the default is
 * `SECURITY_KINDS`, and page views are available by asking.
 *
 * ── What this trail is, and is not ─────────────────────────────────────────────
 * `src/server/activity.ts` says it plainly: every write is best-effort, so the
 * trail can have holes. It is an operations aid — what an operator reads to
 * understand what happened — not evidence. The ledger remains the record of truth
 * for money, and the console's audit screen says so rather than implying otherwise.
 */

export interface AuditTrailDto {
  readonly entries: readonly ActivityEventDto[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  /** True when the read failed. An empty trail and an unreadable one differ. */
  readonly degraded: boolean;
}

export interface AuditTrailOptions {
  readonly kinds?: readonly ActivityKind[] | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function getAuditTrail(
  events: ActivityRepository,
  options: AuditTrailOptions = {},
): Promise<AuditTrailDto> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);
  const kinds = options.kinds ?? SECURITY_KINDS;

  // `allSettled`, not `all`: the realistic failure is an unreachable database, in
  // which case both reject — and `Promise.all` leaves the second rejection
  // unattached, which Node terminates the process for by default.
  const [entries, total] = await Promise.allSettled([
    events.listRecent({ kinds, limit, offset }),
    events.countRecent(kinds),
  ]);

  if (entries.status === 'rejected') {
    logger.error({ event: 'audit_trail_read_failed', module: 'activity' }, entries.reason);
    return { entries: [], total: 0, limit, offset, degraded: true };
  }

  return {
    entries: entries.value.map(toActivityEventDto),
    // Falls back to what is on screen rather than to zero: "showing 50 of 0" reads
    // as a bug, and the count only ever drives a pager.
    total: total.status === 'fulfilled' ? total.value : entries.value.length,
    limit,
    offset,
    degraded: false,
  };
}
