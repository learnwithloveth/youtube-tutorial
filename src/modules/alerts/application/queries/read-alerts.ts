import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import type { AlertDirection, AlertStatus, PriceAlert } from '../../domain/price-alert';
import type { AlertDependencies } from '../ports';

/**
 * A customer's alerts, as the page renders them.
 *
 * ── The distance to target is not computed here ───────────────────────────────
 * It needs a current price, and this module has none — deliberately, so nothing in
 * it knows market-data exists. The page joins the two, which is the same seam the
 * evaluator uses when it hands prices in.
 */

export interface PriceAlertDto {
  readonly id: string;
  readonly symbol: string;
  readonly direction: AlertDirection;
  /** Exact decimal string. */
  readonly target: string;
  readonly status: AlertStatus;
  readonly createdAt: string;
  readonly triggeredAt: string | null;
  readonly triggeredPrice: string | null;
}

export interface AlertBoardDto {
  readonly alerts: readonly PriceAlertDto[];
  readonly armed: number;
  readonly muted: number;
  readonly triggered: number;
  /** True when the read failed — an empty page is not the same as no alerts. */
  readonly degraded: boolean;
}

export async function getAlertBoard(
  deps: AlertDependencies,
  userId: UserId,
): Promise<AlertBoardDto> {
  try {
    const rows = await deps.alerts.listForUser(userId);
    const alerts = rows.map(toDto);

    return {
      alerts,
      armed: alerts.filter((alert) => alert.status === 'armed').length,
      muted: alerts.filter((alert) => alert.status === 'muted').length,
      triggered: alerts.filter((alert) => alert.status === 'triggered').length,
      degraded: false,
    };
  } catch (error) {
    logger.error({ event: 'alert_board_read_failed', module: 'alerts' }, error);
    return { alerts: [], armed: 0, muted: 0, triggered: 0, degraded: true };
  }
}

/**
 * How far the feed has been read.
 *
 * Returns null when the account has never opened it — which is different from
 * "read nothing", and the caller treats the difference as "everything is unread"
 * rather than inventing a start date.
 */
export async function getLastRead(
  deps: AlertDependencies,
  userId: UserId,
): Promise<Date | null> {
  try {
    return await deps.reads.lastReadAt(userId);
  } catch (error) {
    logger.warn({ event: 'notification_read_marker_failed', module: 'alerts' }, error);
    return null;
  }
}

function toDto(alert: PriceAlert): PriceAlertDto {
  const snapshot = alert.snapshot();
  return {
    id: snapshot.id,
    symbol: snapshot.symbol,
    direction: snapshot.direction,
    target: snapshot.target.toTrimmedString(),
    status: snapshot.status,
    createdAt: snapshot.createdAt.toISOString(),
    triggeredAt: snapshot.triggeredAt?.toISOString() ?? null,
    triggeredPrice: snapshot.triggeredPrice?.toTrimmedString() ?? null,
  };
}
