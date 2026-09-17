import 'server-only';

import { after } from 'next/server';

import type { ActivityKind } from '@/modules/activity';
import { getAuditTrail, type RecordActivityCommand } from '@/modules/activity/server';
import type { RecordPresenceResult } from '@/modules/presence/server';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { activity, getActivityForUser, recordActivity, toEventLocation } from './activity';
import { identity } from './auth';
import { ADMIN_FEED_KINDS, adminCopyFor, type NotificationTone } from './notification-copy';
import { hasOtherOpenTab } from './presence';
import { support } from './support';

/**
 * What the console is told about customers.
 *
 * Three things reach operators: a customer arriving on the site, a customer writing
 * to support, and every notification a customer receives. Each goes two ways —
 * a push to every operator device that turned notifications on, and an entry in the
 * console's own feed, which every admin page shows as it happens.
 *
 * ── The feed is a view over the activity trail, like the customer's bell ───────
 * Every one of these is already an event on the customer's trail, or becomes one
 * here, so the console reads the trail rather than a table of its own. That is the
 * arrangement `server/notifications.ts` explains for the customer's side, for the
 * same reason: two records of the same event come to disagree.
 *
 * ── Customers only ─────────────────────────────────────────────────────────────
 * An operator's own sign-in is not news to the console. Every path here checks the
 * account's role and drops anything that is not a customer's.
 */

/** A tab seen more recently than this means the customer never left. */
const VISIT_GAP_MS = 10 * 60_000;

/** An arrival this soon after a sign-in has already been announced — as the sign-in. */
const SIGN_IN_GRACE_MS = 2 * 60_000;

/**
 * Records an event on the customer's trail and tells operators about it.
 *
 * For events a customer causes that operators act on — a withdrawal requested, a
 * deposit claimed, documents submitted — and for arrivals. `push: false` records it
 * for the console's feed without a push, for a caller that already sent one.
 *
 * Never throws, like everything on the trail's write path.
 */
export async function recordForAdmins(
  command: RecordActivityCommand,
  options: { readonly push?: boolean } = {},
): Promise<void> {
  await recordActivity(command);
  if (options.push !== false) alertAdmins(command);
}

/**
 * Pushes one customer event to every operator device.
 *
 * Called after the event is recorded. The send runs after the response where there
 * is one, for the reason `recordAndPush` gives, and names the customer, which needs
 * a directory lookup the request should not wait for either.
 */
export function alertAdmins(command: RecordActivityCommand): void {
  if (!ADMIN_FEED_KINDS.includes(command.kind)) return;

  const send = async (): Promise<void> => {
    try {
      const context = support();
      if (context === null) return;

      const account = (await identity().describeUsers([command.userId])).get(command.userId);
      if (account === undefined || account.role !== 'customer') return;

      const copy = adminCopyFor(
        {
          kind: command.kind,
          reference: command.reference ?? null,
          detail: command.detail ?? null,
          path: command.path ?? null,
          browser: command.agent?.browser ?? null,
          device: command.agent?.device ?? null,
          location: command.location ?? null,
        },
        { id: account.id, email: account.email },
      );
      if (copy === null) return;

      await context.dependencies.push.notify({
        audience: 'operators',
        title: copy.title,
        body: copy.body,
        link: copy.link,
        tag: copy.tag,
      });
    } catch (error) {
      logger.warn({ event: 'admin_push_failed', module: 'support', kind: command.kind }, error);
    }
  };

  try {
    after(send);
  } catch {
    // Outside a request — the price alert loop. Nothing to wait for.
    void send();
  }
}

/**
 * Tells operators a customer has arrived, when a tab's arrival is a visit.
 *
 * A tab arriving is not always somebody arriving. It is not when the customer
 * already has another tab open, or had one moments ago — and it has already been
 * said when they signed in a moment ago, because the sign-in itself is announced.
 * What is left is the thing worth an interruption: somebody who was not here, and
 * now is.
 */
export async function announceArrival(input: {
  readonly user: { readonly id: UserId; readonly role: string };
  readonly result: RecordPresenceResult;
}): Promise<void> {
  const { user, result } = input;
  if (!result.arrived || user.role !== 'customer') return;

  try {
    if (await hasOtherOpenTab(user.id, result.visitorId, VISIT_GAP_MS)) return;

    const recent = await getActivityForUser(user.id, { kinds: ['sign-in'], limit: 1 });
    const lastSignIn = recent.recent.events[0];
    if (lastSignIn && Date.now() - Date.parse(lastSignIn.occurredAt) < SIGN_IN_GRACE_MS) return;

    await recordForAdmins({
      userId: user.id,
      kind: 'visit-started',
      path: result.path,
      location: toEventLocation(result.observed.location),
      agent:
        result.observed.device === null
          ? null
          : { device: result.observed.device, browser: result.observed.browser },
      ipDigest: result.observed.ipDigest,
      visitorId: result.visitorId,
    });
  } catch (error) {
    logger.warn({ event: 'arrival_announce_failed', module: 'presence' }, error);
  }
}

export interface AdminFeedItemDto {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly tone: NotificationTone;
  readonly occurredAt: string;
  /** Measured on the server, for the reason `NotificationDto.ageSeconds` is. */
  readonly ageSeconds: number;
}

export interface AdminFeedDto {
  readonly items: readonly AdminFeedItemDto[];
  /** True when the read failed — an empty feed and an unreadable one differ. */
  readonly degraded: boolean;
}

/**
 * The console's feed: the newest customer events, in the console's words.
 *
 * Read over the trail across every account, then narrowed to customers. Over-reads
 * by a factor of three, because operators' own sign-ins are in the same trail and
 * are dropped after the read, not before it.
 */
export async function getAdminFeed(limit = 20): Promise<AdminFeedDto> {
  const context = activity();
  if (context === null) return { items: [], degraded: true };

  try {
    const trail = await getAuditTrail(context.dependencies.events, {
      kinds: ADMIN_FEED_KINDS,
      limit: limit * 3,
    });
    if (trail.degraded) return { items: [], degraded: true };

    const ids = [...new Set(trail.entries.map((entry) => entry.userId))].flatMap((id) => {
      try {
        return [toUserId(id)];
      } catch {
        return [];
      }
    });
    const accounts = ids.length === 0 ? new Map() : await identity().describeUsers(ids);

    const now = Date.now();
    const items: AdminFeedItemDto[] = [];
    for (const entry of trail.entries) {
      const account = accounts.get(entry.userId as UserId);
      if (account === undefined || account.role !== 'customer') continue;

      const copy = adminCopyFor(
        {
          kind: entry.kind,
          reference: entry.reference,
          detail: entry.detail,
          path: entry.path,
          browser: entry.browser,
          device: entry.device,
          location: entry.location,
        },
        { id: account.id, email: account.email },
      );
      if (copy === null) continue;

      items.push({
        id: entry.id,
        kind: entry.kind,
        title: copy.title,
        body: copy.body,
        link: copy.link,
        tone: copy.tone,
        occurredAt: entry.occurredAt,
        ageSeconds: Math.max(0, Math.floor((now - Date.parse(entry.occurredAt)) / 1000)),
      });
      if (items.length === limit) break;
    }

    return { items, degraded: false };
  } catch (error) {
    logger.warn({ event: 'admin_feed_read_failed', module: 'activity' }, error);
    return { items: [], degraded: true };
  }
}
