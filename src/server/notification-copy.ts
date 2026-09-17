import 'server-only';

import type { ActivityKind, EventLocation } from '@/modules/activity';

/**
 * What a notification says — in the bell and on a device.
 *
 * ── One copy for both ─────────────────────────────────────────────────────────
 * A push is the same notification the bell shows, arriving somewhere else. Written
 * twice, the phone would say "Deposit credited" while the bell said something else
 * about the same event, so both are built from here.
 *
 * Its own file, with nothing but types imported, so the wording and the routing can
 * be tested without a database behind them.
 */

export type NotificationTone = 'up' | 'down' | 'warn' | 'brand' | 'neutral';

/**
 * How each event reads.
 *
 * Written from the customer's side, which is a different voice to the audit log's:
 * the console says "Withdrawal approved" about somebody, and this says "Your
 * withdrawal was approved" to them.
 */
export const COPY: Partial<Record<ActivityKind, { title: string; tone: NotificationTone }>> = {
  'price-alert-triggered': { title: 'Price alert', tone: 'brand' },
  'deposit-recorded': { title: 'Deposit credited', tone: 'up' },
  'deposit-rejected': { title: 'Deposit not accepted', tone: 'down' },
  'withdrawal-requested': { title: 'Withdrawal requested', tone: 'neutral' },
  'withdrawal-approved': { title: 'Withdrawal approved', tone: 'up' },
  'withdrawal-rejected': { title: 'Withdrawal not approved', tone: 'down' },
  'verification-approved': { title: 'Identity verified', tone: 'up' },
  'verification-rejected': { title: 'Identity verification refused', tone: 'down' },
  'password-reset': { title: 'Password changed', tone: 'warn' },
  'email-verified': { title: 'Email confirmed', tone: 'up' },
  'sign-in': { title: 'New sign-in', tone: 'warn' },
  'receipt-sent': { title: 'Receipt emailed', tone: 'neutral' },
};

/** The parts of an event its wording is built from — a stored one or one being recorded. */
export interface DescribableEvent {
  readonly kind: ActivityKind;
  readonly reference: string | null;
  readonly detail: string | null;
  readonly browser: string | null;
  readonly device: string | null;
  readonly location: Pick<EventLocation, 'city' | 'country'> | null;
}

/** The detail line, built from what the event actually recorded. */
export function bodyFor(event: DescribableEvent): string | null {
  if (event.kind === 'sign-in') {
    const place = [event.location?.city, event.location?.country].filter(Boolean).join(', ');
    // The device and where from, which is the whole reason a sign-in is notified:
    // somebody reading this has to be able to tell "that was me" from "that was not".
    return [event.browser, event.device, place].filter(Boolean).join(' · ') || null;
  }
  return event.detail;
}

/**
 * Where a click on a pushed notification lands.
 *
 * The screen that shows the thing itself where there is one. A decision that moved
 * no money has no line on the statement, so a refusal lands on the feed, which is
 * the one place certain to show it.
 */
const PUSH_LINKS: Partial<Record<ActivityKind, string>> = {
  'price-alert-triggered': '/app/alerts',
  'deposit-recorded': '/app/transactions',
  'withdrawal-approved': '/app/transactions',
  'verification-approved': '/app/settings?tab=verification',
  'verification-rejected': '/app/settings?tab=verification',
  'password-reset': '/app/settings?tab=security',
  'sign-in': '/app/settings?tab=security',
};

const FEED = '/app/notifications';

/**
 * Kinds whose detail line is written for the audit trail, not for the customer.
 *
 * An identity decision records `by <operator's email>` so the console can say who
 * made it. That is not something to print on a customer's lock screen, where
 * anyone near the phone reads it, so these are pushed with the title alone.
 */
const TITLE_ONLY: ReadonlySet<ActivityKind> = new Set([
  'verification-approved',
  'verification-rejected',
]);

export interface ActivityPush {
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly tag?: string | undefined;
}

/**
 * The push for one event, or null for a kind the bell would not show either.
 *
 * ── Only alerts replace one another ───────────────────────────────────────────
 * A re-armed alert firing again is the same news, so it takes the earlier
 * notification's place. Two withdrawals, or two sign-ins, are two things somebody
 * needs to see — a second sign-in quietly replacing the first is exactly the one
 * that would go unread.
 */
export function pushFor(event: DescribableEvent): ActivityPush | null {
  const copy = COPY[event.kind];
  if (copy === undefined) return null;

  return {
    title: copy.title,
    body: TITLE_ONLY.has(event.kind) ? '' : (bodyFor(event) ?? ''),
    link: PUSH_LINKS[event.kind] ?? FEED,
    tag:
      event.kind === 'price-alert-triggered' && event.reference !== null
        ? `alert-${event.reference}`
        : undefined,
  };
}
