import 'server-only';

import { cache } from 'react';

import type { ActivityEventDto, ActivityKind } from '@/modules/activity';
import { logger } from '@/platform/observability/logger';
import type { UserId } from '@/shared/kernel/ids';

import { getActivityForUser } from './activity';
import { alerts, getNotificationsReadAt } from './alerts';
import { bodyFor, COPY, type NotificationTone } from './notification-copy';

/**
 * A customer's notification feed.
 *
 * ── It is a view over the activity trail, not a second table ──────────────────
 * Every event worth telling somebody about is already written to `activity.events`
 * by the request that performed it: a deposit credited, a withdrawal decided, a
 * sign-in from a new device, an identity decision, a price alert firing. A
 * notifications table would mean writing each of those twice, on the same path,
 * and keeping the two in step forever — with the failure mode that the bell and
 * the account history disagree about what happened.
 *
 * What cannot be derived is how far somebody has read, and that is the one row the
 * alerts module stores.
 *
 * ── Which kinds reach a customer ──────────────────────────────────────────────
 * Not all of them. The trail records what happened; a notification is what is
 * worth interrupting somebody for. `verification-sent` is the email they are
 * currently reading, `sign-out` is a thing they just did, and `page-view` is a
 * browsing history. Those stay in the audit trail and out of the bell.
 *
 * ── What the old dropdown claimed ─────────────────────────────────────────────
 * "Limit order filled — 0.8 ETH sold at $4,480.00" and "Staking reward paid —
 * +$41.28 in SOL credited" were fixtures. This platform has no matching engine and
 * no staking distribution, so neither event can occur, and a notification asserting
 * a fill is a customer believing they have a position they do not have. Both are
 * gone rather than reimplemented.
 */

/** The kinds a customer is told about, in the order of how much they matter. */
export const NOTIFIABLE: readonly ActivityKind[] = [
  'price-alert-triggered',
  'deposit-recorded',
  'deposit-rejected',
  'withdrawal-approved',
  'withdrawal-rejected',
  'withdrawal-requested',
  'verification-approved',
  'verification-rejected',
  'password-reset',
  'email-verified',
  'sign-in',
  'receipt-sent',
];

export type { NotificationTone } from './notification-copy';

export interface NotificationDto {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly occurredAt: string;
  /**
   * Seconds since it happened, measured on the server.
   *
   * Carried rather than computed in the component for the reason `formatAge`
   * documents: a component that read `Date.now()` during render would produce
   * different HTML on each side of hydration and React would discard the
   * subtree. The bell renders this as "4m ago"; the page prints the full
   * stamp beside it, because a document needs the moment and a glance does not.
   */
  readonly ageSeconds: number;
  readonly unread: boolean;
  readonly tone: NotificationTone;
  /** The kind, so a page can group and filter without re-deriving it from copy. */
  readonly kind: ActivityKind;
  readonly reference: string | null;
}

export interface NotificationFeedDto {
  readonly items: readonly NotificationDto[];
  readonly unread: number;
  /** Everything notifiable on the account, for paging on the full page. */
  readonly total: number;
  /** True when the read failed — an empty bell is not the same as nothing new. */
  readonly degraded: boolean;
}

/**
 * Deduplicated per request: the top bar renders on every page of the application,
 * and the alerts page asks for the same feed again.
 */
export const getNotifications = cache(
  async (
    userId: UserId,
    options: { limit?: number; offset?: number; kinds?: readonly ActivityKind[] } = {},
  ): Promise<NotificationFeedDto> => {
    const limit = options.limit ?? 12;

    /*
     * The intersection, computed before the query rather than inside it.
     *
     * An empty result has to short-circuit here: `ActivityRepository` treats an
     * empty `kinds` array as *no filter* — a deliberate choice documented at
     * `scope()`, because `IN ()` matches nothing and reads at a call site as
     * "unfiltered". So narrowing to nothing would silently widen to everything,
     * and `?filter` pointing at a kind the bell withholds would surface it. A
     * probe caught exactly that.
     */
    const kinds = options.kinds
      ? NOTIFIABLE.filter((kind) => options.kinds?.includes(kind))
      : NOTIFIABLE;
    if (kinds.length === 0) return { items: [], unread: 0, total: 0, degraded: false };

    try {
      const [activity, lastRead] = await Promise.all([
        getActivityForUser(userId, {
          kinds,
          limit,
          offset: options.offset ?? 0,
        }),
        getNotificationsReadAt(userId),
      ]);

      if (activity.degraded) return { items: [], unread: 0, total: 0, degraded: true };

      const now = Date.now();
      const items = activity.recent.events.map((event) => toNotification(event, lastRead, now));
      return {
        items,
        unread: items.filter((item) => item.unread).length,
        total: activity.recent.total,
        degraded: false,
      };
    } catch (error) {
      logger.warn({ event: 'notification_feed_read_failed', module: 'alerts' }, error);
      return { items: [], unread: 0, total: 0, degraded: true };
    }
  },
);

/**
 * Marks everything up to now as read.
 *
 * ── `now`, not the newest item's timestamp ────────────────────────────────────
 * An event written between the read and this call would otherwise be marked read
 * without ever having been shown. Using the clock closes that window in the only
 * direction that matters: at worst somebody sees a notification they have already
 * seen, never the reverse.
 */
export async function markNotificationsRead(userId: UserId): Promise<void> {
  const context = alerts();
  if (context === null) return;

  try {
    await context.dependencies.reads.markReadAt(userId, new Date());
  } catch (error) {
    logger.warn({ event: 'notification_mark_read_failed', module: 'alerts' }, error);
  }
}

function toNotification(
  event: ActivityEventDto,
  lastRead: Date | null,
  now: number,
): NotificationDto {
  const copy = COPY[event.kind] ?? { title: event.kind, tone: 'neutral' as const };
  const at = new Date(event.occurredAt).getTime();

  return {
    id: event.id,
    kind: event.kind,
    reference: event.reference,
    title: copy.title,
    body: bodyFor(event),
    occurredAt: event.occurredAt,
    // Clamped at zero: a row written by a host whose clock runs a second fast
    // would otherwise render as "-1s ago".
    ageSeconds: Math.max(0, Math.floor((now - at) / 1000)),
    // Never read before means everything is unread, rather than a start date
    // somebody invented for an account that has not opened the bell.
    unread: lastRead === null || new Date(event.occurredAt).getTime() > lastRead.getTime(),
    tone: copy.tone,
  };
}
