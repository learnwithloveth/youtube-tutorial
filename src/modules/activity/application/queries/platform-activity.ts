import { logger } from '@/platform/observability/logger';

import type { ActivityKind } from '../../domain/event';
import type { ActivityRepository } from '../ports';

/**
 * How much the platform is being used, by day.
 *
 * ── Every day appears, including the empty ones ────────────────────────────────
 * The database returns only days that have rows. Handing that straight to a chart
 * draws a quiet Sunday at the same x-position as a busy Monday and closes the gap
 * — so a fortnight of nothing followed by one busy day reads as steady growth.
 *
 * A day with no activity is a measurement, not a missing measurement. So the
 * series is filled to one point per day and the zeros are drawn. Nothing is
 * interpolated: this fills gaps with the number that was actually observed, which
 * is the opposite of inventing a value for a gap.
 */

export interface ActivityDayDto {
  /** `YYYY-MM-DD`, UTC. */
  readonly day: string;
  readonly total: number;
}

export interface PlatformActivityDto {
  /** Oldest first — the order a time axis is drawn in. */
  readonly days: readonly ActivityDayDto[];
  readonly total: number;
  /** True when the read failed. No data and no answer are different states. */
  readonly degraded: boolean;
}

export interface PlatformActivityOptions {
  readonly days?: number | undefined;
  readonly kinds?: readonly ActivityKind[] | undefined;
}

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
const DAY_MS = 86_400_000;

export async function getPlatformActivity(
  events: ActivityRepository,
  now: Date,
  options: PlatformActivityOptions = {},
): Promise<PlatformActivityDto> {
  const span = Math.min(Math.max(options.days ?? DEFAULT_DAYS, 1), MAX_DAYS);

  // From the start of the earliest UTC day in the window, so the first bucket is a
  // whole day rather than a partial one that reads as a slow start.
  const start = startOfUtcDay(new Date(now.getTime() - (span - 1) * DAY_MS));

  try {
    const rows = await events.tallyByDay({ since: start, kinds: options.kinds });
    const counted = new Map(rows.map((row) => [row.day, row.total]));

    const days: ActivityDayDto[] = [];
    for (let offset = 0; offset < span; offset += 1) {
      const day = isoDay(new Date(start.getTime() + offset * DAY_MS));
      days.push({ day, total: counted.get(day) ?? 0 });
    }

    return {
      days,
      total: days.reduce((sum, day) => sum + day.total, 0),
      degraded: false,
    };
  } catch (error) {
    logger.error({ event: 'platform_activity_read_failed', module: 'activity' }, error);
    // An empty series rather than a flat line of zeros: zeros would assert that
    // nothing happened, which is a claim this read is in no position to make.
    return { days: [], total: 0, degraded: true };
  }
}

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}
