import type { Clock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { ActivityEvent, ActivityKind } from '../domain/event';

/**
 * Ports for the activity module.
 *
 * One repository and a clock. There is deliberately no "update" and no "delete by
 * id": the only writes an audit trail supports are appending and expiring, and a
 * port that offered more would be an invitation to correct history in place.
 */
export interface ActivityRepository {
  nextId(): string;
  /** Appends. Never updates — an event is immutable once written. */
  append(event: ActivityEvent): Promise<void>;

  /**
   * One account's events, newest first.
   *
   * Paged by offset rather than by cursor. An audit trail is append-only and read
   * newest-first, so a page boundary shifts only when new events arrive at the
   * head — and an operator reading page three of someone's history is looking at a
   * fixed past, not a moving window.
   */
  listForUser(query: {
    userId: UserId;
    kinds?: readonly ActivityKind[] | undefined;
    limit: number;
    offset: number;
  }): Promise<ActivityEvent[]>;

  /** Total matching `listForUser`, for the pager. */
  countForUser(userId: UserId, kinds?: readonly ActivityKind[] | undefined): Promise<number>;

  /**
   * Per-kind counts and the most recent occurrence, in one round trip.
   *
   * A summary header that issued one query per kind would be seven queries behind
   * a page render, and they all read the same index.
   */
  summariseUser(userId: UserId): Promise<
    { kind: ActivityKind; total: number; lastAt: Date }[]
  >;

  /**
   * The routes an account visits most, with time spent.
   *
   * Aggregated in the database rather than by reading every event into memory: a
   * year of history for an active account is a lot of rows to page in so a panel
   * can show ten of them.
   */
  topPathsForUser(
    userId: UserId,
    limit: number,
  ): Promise<{ path: string; views: number; totalSeconds: number }[]>;

  /**
   * The whole platform's trail, newest first.
   *
   * Paged by offset rather than by cursor, for the reason `listForUser` is: an
   * audit trail is append-only and read newest-first, so a page boundary shifts
   * only when new events arrive at the head — and somebody reading page three of
   * last week is looking at a fixed past, not a moving window.
   */
  listRecent(query: {
    kinds?: readonly ActivityKind[] | undefined;
    limit: number;
    offset: number;
  }): Promise<ActivityEvent[]>;

  /** Total matching `listRecent`, for the pager. */
  countRecent(kinds?: readonly ActivityKind[] | undefined): Promise<number>;

  /**
   * Platform-wide counts, one bucket per UTC day.
   *
   * Aggregated in the database for the same reason `topPathsForUser` is: a month
   * of platform-wide events is a lot of rows to page into memory so a chart can
   * draw thirty points.
   *
   * UTC rather than a viewer's timezone, because the buckets have to agree with
   * the ledger's daily windows — a console where "today" means one thing on the
   * chart and another in the limits is a console nobody can reconcile.
   */
  tallyByDay(query: {
    since: Date;
    kinds?: readonly ActivityKind[] | undefined;
  }): Promise<{ day: string; total: number }[]>;

  /**
   * Deletes events past the retention window for their kind.
   *
   * Takes both cut-offs because the two kinds are kept for different lengths —
   * see `retentionMsFor`. Bounded per call so one invocation cannot hold a lock
   * for an unbounded time.
   */
  deleteExpired(cutoffs: { pageViews: Date; security: Date }, limit: number): Promise<number>;
}

export interface ActivityDependencies {
  events: ActivityRepository;
  clock: Clock;
}
