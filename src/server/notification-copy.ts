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
  // Not 'Deposit credited'. The customer is told what it is, in the same words
  // their statement uses, so nobody discovers later that a workshop balance was
  // never money.
  'demo-funds-granted': { title: 'Demo funds added', tone: 'brand' },
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
  'demo-funds-granted': '/app/transactions',
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

/* =============================================================================
 * Operators' copy.
 *
 * The console hears about customers: one arriving, one writing to support, and
 * every notification a customer receives. Written in the console's voice — about
 * somebody, naming them — where the customer's copy above speaks to them.
 * ========================================================================== */

/**
 * What operators are told about, always concerning a customer account.
 *
 * `withdrawal-requested`, the claim side of `deposit-recorded` and
 * `verification-submitted` lead: they are the three that are waiting on an operator.
 * `receipt-sent` is absent because an operator sends it, and nobody needs to be told
 * what they have just done.
 */
export const ADMIN_FEED_KINDS: readonly ActivityKind[] = [
  'withdrawal-requested',
  'deposit-recorded',
  'verification-submitted',
  'support-message-sent',
  'visit-started',
  'sign-in',
  'withdrawal-approved',
  'withdrawal-rejected',
  'deposit-rejected',
  'verification-approved',
  'verification-rejected',
  'price-alert-triggered',
  'password-reset',
  'email-verified',
];

/** An event as the console's copy reads it: the customer-facing fields, and where it happened. */
export interface AdminFeedEvent extends DescribableEvent {
  /** The page, for an arrival. Null for everything else. */
  readonly path: string | null;
  /**
   * The whole fix, not just the city: an arrival says *how* the place was known,
   * and that needs `source`. Narrower than the customer's copy, which never says.
   */
  readonly location: EventLocation | null;
}

/**
 * Where somebody is, in the words the console uses elsewhere.
 *
 * "near Lagos, NG" for a place derived from an address, "Lagos, NG" for one the
 * device gave: a consented fix and a guess from an IP are not the same claim, and
 * the rest of the console is careful to say which. A notification that flattened
 * them would assert a precision nobody has.
 */
function placeOf(location: EventLocation | null): string | null {
  if (location === null) return null;

  // City and country is enough to picture. The region earns its place only when
  // the fix never resolved a city.
  const named = location.city ?? location.region;
  const place = [named, location.country].filter((part) => Boolean(part)).join(', ');

  if (place.length === 0) return null;
  return location.source === 'device' ? place : `near ${place}`;
}

/** `Chrome on desktop`, or whichever half was recognised. */
function clientOf(browser: string | null, device: string | null): string | null {
  if (browser !== null && device !== null) return `${browser} on ${device}`;
  return browser ?? device;
}

/** What a visitor with no account is described by: where they are, and on what. */
export interface VisitorArrival {
  /** The page they landed on, already normalised to a route. */
  readonly path: string;
  readonly visitorId: string;
  readonly location: EventLocation | null;
  readonly browser: string | null;
  readonly device: string | null;
}

/**
 * What operators are told when somebody with no account lands on the site.
 *
 * ── Not an entry on anybody's trail ───────────────────────────────────────────
 * The activity trail records what an *account* did, and this visitor has none, so
 * this copy is built straight from the heartbeat rather than read back from a
 * stored event. It is a push and a line on the live board; the console's bell
 * stays what it is, an account's history.
 *
 * The link goes to the live board because that is the screen that can answer the
 * next question — who else is here, and where are they now.
 */
export function visitorCopyFor(visit: VisitorArrival): AdminCopy {
  return {
    title: 'Visitor online',
    body:
      [`on ${visit.path}`, placeOf(visit.location), clientOf(visit.browser, visit.device)]
        .filter((part): part is string => part !== null)
        .join(' · '),
    link: '/admin/live',
    tone: 'neutral',
    // One notification per visitor on a device: a second landing from the same
    // browsing context replaces the first rather than stacking under it.
    tag: `visit-${visit.visitorId}`,
  };
}

export interface AdminCopy {
  readonly title: string;
  readonly body: string;
  /** The console screen that acts on it — the queue when something is waiting, otherwise the account. */
  readonly link: string;
  readonly tone: NotificationTone;
  /**
   * Set only for arrivals: one customer's newest arrival replaces the last on a
   * device. Everything else stands on its own, for the reason given at `pushFor`.
   */
  readonly tag?: string | undefined;
}

/**
 * Whether a deposit event is an operator's decision rather than the customer's claim.
 *
 * Both are recorded as `deposit-recorded`. A decision names its operator in the
 * reference — `<claim> by <operator>` — which a claim, filed by the customer
 * about their own money, never does.
 */
function decidedByOperator(reference: string | null): boolean {
  return reference !== null && reference.includes(' by ');
}

/**
 * A queue page, pointed at one row.
 *
 * Returns the bare queue when there is no reference to point at, rather than a
 * fragment that matches nothing: a link that scrolls nowhere is worse than one
 * that lands at the top, because it looks like the row is missing.
 */
function queueAnchor(page: string, prefix: string, reference: string | null): string {
  if (reference === null || reference.length === 0) return page;
  return `${page}#${prefix}-${encodeURIComponent(reference)}`;
}

export function adminCopyFor(
  event: AdminFeedEvent,
  customer: { readonly id: string; readonly email: string },
): AdminCopy | null {
  if (!ADMIN_FEED_KINDS.includes(event.kind)) return null;

  const account = `/admin/users/${encodeURIComponent(customer.id)}`;
  const about = (detail: string | null) => (detail ? `${customer.email} · ${detail}` : customer.email);

  switch (event.kind) {
    case 'visit-started':
      return {
        title: 'Customer online',
        // The same three facts a signed-out visitor's notification carries, with a
        // name in front of them — an operator reading both should not have to
        // decode two formats.
        body: [
          `${customer.email} is on ${event.path ?? 'the site'}`,
          placeOf(event.location),
          clientOf(event.browser, event.device),
        ]
          .filter((part): part is string => part !== null)
          .join(' · '),
        /*
         * This person, not the board of everybody.
         *
         * It used to be `/admin/live`, which answers "who is here" — but the
         * notification has already answered that, by name. What an operator opens
         * it to see is what *this* customer is doing, and their account page is
         * the only screen carrying both halves: the live map overlay showing where
         * they are, and the activity timeline showing what they have done.
         *
         * A signed-out visitor still goes to the board. There is no account page
         * to open, and the board is the whole of what is known about them — see
         * `visitorCopyFor`.
         */
        link: account,
        tone: 'brand',
        tag: `visit-${customer.id}`,
      };
    case 'support-message-sent':
      return {
        title: 'New support message',
        body: `${customer.email} wrote to support`,
        link: event.reference
          ? `/admin/support?conversation=${encodeURIComponent(event.reference)}`
          : '/admin/support',
        tone: 'brand',
      };
    case 'withdrawal-requested':
      return {
        title: 'Withdrawal requested',
        body: about(event.detail),
        // The row itself. A queue twenty deep is not "where to act" when the
        // notification was about one withdrawal — see `Panel`'s `id`.
        link: queueAnchor('/admin/approvals', 'withdrawal', event.reference),
        tone: 'warn',
      };
    case 'deposit-recorded':
      return decidedByOperator(event.reference)
        ? { title: 'Deposit credited', body: about(event.detail), link: account, tone: 'up' }
        : {
            title: 'Deposit claim submitted',
            body: about(event.detail),
            link: queueAnchor('/admin/approvals', 'claim', event.reference),
            tone: 'warn',
          };
    case 'verification-submitted':
      return { title: 'Identity documents submitted', body: customer.email, link: '/admin/kyc', tone: 'warn' };
    case 'sign-in':
      return { title: 'Customer signed in', body: about(bodyFor(event)), link: account, tone: 'neutral' };
    case 'withdrawal-approved':
      return { title: 'Withdrawal approved', body: about(event.detail), link: account, tone: 'up' };
    case 'withdrawal-rejected':
      return { title: 'Withdrawal refused', body: about(event.detail), link: account, tone: 'down' };
    case 'deposit-rejected':
      return { title: 'Deposit refused', body: about(event.detail), link: account, tone: 'down' };
    case 'verification-approved':
      return { title: 'Identity verified', body: about(event.detail), link: account, tone: 'up' };
    case 'verification-rejected':
      return { title: 'Identity verification refused', body: about(event.detail), link: account, tone: 'down' };
    case 'price-alert-triggered':
      return { title: 'Price alert fired', body: about(event.detail), link: account, tone: 'neutral' };
    case 'password-reset':
      return { title: 'Password changed', body: about(event.detail), link: account, tone: 'warn' };
    case 'email-verified':
      return { title: 'Email confirmed', body: customer.email, link: account, tone: 'up' };
    default:
      return null;
  }
}
