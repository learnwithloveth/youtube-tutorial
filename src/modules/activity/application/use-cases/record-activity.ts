import type { UserId } from '@/shared/kernel/ids';

import {
  ActivityEvent,
  type ActivityKind,
  type EventAgent,
  type EventLocation,
} from '../../domain/event';
import type { ActivityDependencies } from '../ports';

export interface RecordActivityCommand {
  readonly userId: UserId;
  readonly kind: ActivityKind;
  readonly path?: string | null | undefined;
  readonly durationSeconds?: number | null | undefined;
  readonly location?: EventLocation | null | undefined;
  readonly agent?: EventAgent | null | undefined;
  readonly ipDigest?: string | null | undefined;
  readonly visitorId?: string | null | undefined;
  /** Defaults to now. Supplied when the caller already knows the exact instant. */
  readonly occurredAt?: Date | undefined;
}

/**
 * Appends one event to an account's history.
 *
 * ── It cannot fail in a way the caller must handle ─────────────────────────────
 * No `Result`. Every caller is doing something else that matters more — signing
 * someone in, recording a heartbeat — and none of them should fail because the
 * audit write did. A malformed command throws, because that is a bug in the
 * caller; an unreachable database throws too, and the facade above swallows it
 * after logging, exactly as the presence write path does.
 *
 * The consequence is worth stating plainly: this trail is best-effort. It is an
 * operations aid, not a ledger, and nothing in the system makes a decision by
 * reading it. If it ever needs to be authoritative — a regulator asking for
 * evidence rather than an operator looking for context — it needs to move into
 * the same transaction as the thing it records, which is a different design.
 */
export function createRecordActivity(deps: ActivityDependencies) {
  return async function recordActivity(command: RecordActivityCommand): Promise<void> {
    const event = ActivityEvent.record({
      id: deps.events.nextId(),
      userId: command.userId,
      kind: command.kind,
      occurredAt: command.occurredAt ?? deps.clock.now(),
      path: command.path ?? null,
      durationSeconds: normaliseDuration(command.durationSeconds),
      location: command.location ?? null,
      agent: command.agent ?? null,
      ipDigest: command.ipDigest ?? null,
      visitorId: command.visitorId ?? null,
    });

    await deps.events.append(event);
  };
}

export type RecordActivity = ReturnType<typeof createRecordActivity>;

/**
 * Bounds a dwell time to something a person could plausibly have spent on a page.
 *
 * A tab left open over a weekend produces a dwell of 200,000 seconds, which is
 * true and useless: it would dominate every "time spent" total and say only that
 * a laptop was closed. Capped at twelve hours, which no real reading session
 * exceeds and which keeps the column summable.
 */
const MAX_DURATION_SECONDS = 12 * 60 * 60;

function normaliseDuration(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.round(value), MAX_DURATION_SECONDS);
}
