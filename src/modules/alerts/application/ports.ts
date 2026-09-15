import type { Clock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { PriceAlert } from '../domain/price-alert';

export interface PriceAlertRepository {
  nextId(): string;
  save(alert: PriceAlert): Promise<void>;
  find(id: string): Promise<PriceAlert | null>;
  remove(id: string, userId: UserId): Promise<boolean>;
  listForUser(userId: UserId): Promise<PriceAlert[]>;
  countForUser(userId: UserId): Promise<number>;
  /**
   * Every armed alert on the platform, for the evaluator.
   *
   * Armed only: a triggered or muted alert cannot fire, so reading them would be
   * loading rows to discard them. Bounded by `limit` because this runs on a
   * schedule and an unbounded read is how a scheduled job becomes an outage.
   */
  listArmed(limit: number): Promise<PriceAlert[]>;
}

/**
 * Where a customer's notification feed has been read up to.
 *
 * ── One marker, not a flag per notification ───────────────────────────────────
 * The feed is a *view* over the activity trail, which is already written for every
 * event worth telling somebody about. Giving each entry its own read flag would
 * mean a second row per event, written on the same path, kept in sync forever. A
 * single "you have seen everything up to here" answers the same question — what is
 * unread — with one row per account and nothing to drift.
 */
export interface NotificationReadRepository {
  lastReadAt(userId: UserId): Promise<Date | null>;
  markReadAt(userId: UserId, at: Date): Promise<void>;
}

export interface AlertDependencies {
  alerts: PriceAlertRepository;
  reads: NotificationReadRepository;
  clock: Clock;
}
