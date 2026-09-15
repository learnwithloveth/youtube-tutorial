import 'server-only';

import { and, asc, count, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Database } from '@/platform/db/client';
import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { PriceAlert, TARGET_SCALE } from '../../domain/price-alert';
import type {
  NotificationReadRepository,
  PriceAlertRepository,
} from '../../application/ports';
import { notificationReads, priceAlerts, type PriceAlertRow } from './schema';

export class DrizzlePriceAlertRepository implements PriceAlertRepository {
  constructor(private readonly db: Database) {}

  nextId(): string {
    return randomUUID();
  }

  async save(alert: PriceAlert): Promise<void> {
    const snapshot = alert.snapshot();

    await this.db
      .insert(priceAlerts)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        symbol: snapshot.symbol,
        direction: snapshot.direction,
        target: snapshot.target.toDecimalString(),
        status: snapshot.status,
        createdAt: snapshot.createdAt,
        triggeredAt: snapshot.triggeredAt,
        triggeredPrice: snapshot.triggeredPrice?.toDecimalString() ?? null,
      })
      .onConflictDoUpdate({
        target: priceAlerts.id,
        set: {
          status: snapshot.status,
          triggeredAt: snapshot.triggeredAt,
          triggeredPrice: snapshot.triggeredPrice?.toDecimalString() ?? null,
        },
      });
  }

  async find(id: string): Promise<PriceAlert | null> {
    const [row] = await this.db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.id, id))
      .limit(1);
    return row === undefined ? null : toDomain(row);
  }

  async remove(id: string, userId: UserId): Promise<boolean> {
    // Owner in the WHERE clause, not checked beforehand: a read-then-delete leaves
    // a window, and this is the statement that must not delete somebody else's row.
    const removed = await this.db
      .delete(priceAlerts)
      .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)))
      .returning({ id: priceAlerts.id });
    return removed.length > 0;
  }

  async listForUser(userId: UserId): Promise<PriceAlert[]> {
    const rows = await this.db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId))
      .orderBy(desc(priceAlerts.createdAt));
    return rows.map(toDomain);
  }

  async countForUser(userId: UserId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId));
    return Number(row?.total ?? 0);
  }

  async listArmed(limit: number): Promise<PriceAlert[]> {
    const rows = await this.db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.status, 'armed'))
      // Oldest first, so a platform with more armed alerts than one batch can hold
      // works through them rather than starving the same tail on every pass.
      .orderBy(asc(priceAlerts.createdAt))
      .limit(limit);
    return rows.map(toDomain);
  }
}

export class DrizzleNotificationReadRepository implements NotificationReadRepository {
  constructor(private readonly db: Database) {}

  async lastReadAt(userId: UserId): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: notificationReads.lastReadAt })
      .from(notificationReads)
      .where(eq(notificationReads.userId, userId))
      .limit(1);
    return row?.at ?? null;
  }

  async markReadAt(userId: UserId, at: Date): Promise<void> {
    await this.db
      .insert(notificationReads)
      .values({ userId, lastReadAt: at })
      .onConflictDoUpdate({ target: notificationReads.userId, set: { lastReadAt: at } });
  }
}

function toDomain(row: PriceAlertRow): PriceAlert {
  return PriceAlert.rehydrate({
    id: row.id,
    userId: row.userId as UserId,
    symbol: row.symbol,
    direction: row.direction,
    target: Money.fromDecimalString(row.target, 'USD', TARGET_SCALE),
    status: row.status,
    createdAt: row.createdAt,
    triggeredAt: row.triggeredAt,
    triggeredPrice:
      row.triggeredPrice === null
        ? null
        : Money.fromDecimalString(row.triggeredPrice, 'USD', TARGET_SCALE),
  });
}
