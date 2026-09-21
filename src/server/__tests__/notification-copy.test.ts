import { describe, expect, it } from 'vitest';

import {
  adminCopyFor,
  bodyFor,
  pushFor,
  visitorCopyFor,
  type DescribableEvent,
} from '../notification-copy';

function event(overrides: Partial<DescribableEvent> & Pick<DescribableEvent, 'kind'>): DescribableEvent {
  return {
    reference: null,
    detail: null,
    browser: null,
    device: null,
    location: null,
    ...overrides,
  };
}

describe('pushFor', () => {
  it('sends a fired alert to the alerts screen, replacing its own earlier notification', () => {
    const push = pushFor(
      event({
        kind: 'price-alert-triggered',
        reference: 'alert-7',
        detail: 'BTC above 100000 — at 100120.55',
      }),
    );

    expect(push).toEqual({
      title: 'Price alert',
      body: 'BTC above 100000 — at 100120.55',
      link: '/app/alerts',
      tag: 'alert-alert-7',
    });
  });

  it('says what the bell says', () => {
    const credited = event({ kind: 'deposit-recorded', detail: '250 USDT credited' });
    expect(pushFor(credited)?.title).toBe('Deposit credited');
    expect(pushFor(credited)?.body).toBe(bodyFor(credited));
  });

  it('lets every withdrawal and sign-in stand on its own rather than replacing the last', () => {
    expect(pushFor(event({ kind: 'withdrawal-approved', detail: '0.5 BTC' }))?.tag).toBeUndefined();
    expect(pushFor(event({ kind: 'sign-in' }))?.tag).toBeUndefined();
  });

  it('describes a sign-in by where it came from, which is what tells "me" from "not me"', () => {
    const push = pushFor(
      event({
        kind: 'sign-in',
        browser: 'Chrome',
        device: 'desktop',
        location: { city: 'Paris', country: 'France' },
      }),
    );

    expect(push?.body).toBe('Chrome · desktop · Paris, France');
    expect(push?.link).toBe('/app/settings?tab=security');
  });

  it('lands a refusal on the feed, since a decision that moved no money is not on the statement', () => {
    expect(pushFor(event({ kind: 'withdrawal-rejected' }))?.link).toBe('/app/notifications');
    expect(pushFor(event({ kind: 'deposit-rejected' }))?.link).toBe('/app/notifications');
  });

  it("keeps the operator's address, recorded for the audit trail, off a lock screen", () => {
    const push = pushFor(
      event({ kind: 'verification-approved', detail: 'by ops@novex.example' }),
    );
    expect(push?.title).toBe('Identity verified');
    expect(push?.body).toBe('');
  });

  it('pushes nothing the bell would not show', () => {
    expect(pushFor(event({ kind: 'page-view' }))).toBeNull();
    expect(pushFor(event({ kind: 'sign-out' }))).toBeNull();
    expect(pushFor(event({ kind: 'verification-sent' }))).toBeNull();
  });

  it('only ever links to a path on this site', () => {
    const kinds = [
      'price-alert-triggered',
      'deposit-recorded',
      'deposit-rejected',
      'withdrawal-approved',
      'withdrawal-rejected',
      'verification-approved',
      'verification-rejected',
      'password-reset',
      'sign-in',
    ] as const;

    for (const kind of kinds) {
      const link = pushFor(event({ kind }))?.link ?? '';
      expect(link.startsWith('/') && !link.startsWith('//')).toBe(true);
    }
  });
});

/** A resolved location, as the trail stores one. `source` is what "near" turns on. */
function fix(
  city: string | null,
  country: string,
  source: 'device' | 'edge' | 'network' = 'network',
  region: string | null = null,
) {
  return {
    source,
    precision: city === null ? ('region' as const) : ('city' as const),
    city,
    region,
    country,
    latitude: null,
    longitude: null,
  };
}

describe('adminCopyFor', () => {
  const customer = { id: 'user-7', email: 'ada@example.com' };
  const event = (overrides: Partial<Parameters<typeof adminCopyFor>[0]> & Pick<Parameters<typeof adminCopyFor>[0], 'kind'>) => ({
    reference: null,
    detail: null,
    browser: null,
    device: null,
    location: null,
    path: null,
    ...overrides,
  });

  it('announces an arrival with the page, replacing that customer’s last arrival', () => {
    expect(adminCopyFor(event({ kind: 'visit-started', path: '/app/wallet' }), customer)).toEqual({
      title: 'Customer online',
      body: 'ada@example.com is on /app/wallet',
      // Their account page, not the live board: the notification has already said
      // who it is, and this is the one screen carrying both where they are and
      // what they have been doing.
      link: '/admin/users/user-7',
      tone: 'brand',
      tag: 'visit-user-7',
    });
  });

  it('carries where they are and what they are on, when the beat knew', () => {
    const copy = adminCopyFor(
      event({
        kind: 'visit-started',
        path: '/',
        location: fix('Lagos', 'NG'),
        browser: 'Chrome',
        device: 'mobile',
      }),
      customer,
    );

    expect(copy?.body).toBe('ada@example.com is on / · near Lagos, NG · Chrome on mobile');
  });

  it('sends a support message to the conversation in the console', () => {
    const copy = adminCopyFor(event({ kind: 'support-message-sent', reference: 'conv/1' }), customer);
    expect(copy?.title).toBe('New support message');
    expect(copy?.link).toBe('/admin/support?conversation=conv%2F1');
  });

  it('sends what is waiting on an operator to the row that holds it', () => {
    expect(
      adminCopyFor(
        event({ kind: 'withdrawal-requested', reference: 'w-9', detail: '0.5 BTC' }),
        customer,
      ),
    ).toMatchObject({
      title: 'Withdrawal requested',
      body: 'ada@example.com · 0.5 BTC',
      link: '/admin/approvals#withdrawal-w-9',
    });
    expect(adminCopyFor(event({ kind: 'verification-submitted' }), customer)?.link).toBe('/admin/kyc');
  });

  it('falls back to the bare queue when there is no row to point at', () => {
    // A fragment matching nothing scrolls nowhere, which reads as the row having
    // vanished. Landing at the top of the queue is the honest answer.
    expect(
      adminCopyFor(event({ kind: 'withdrawal-requested', detail: '0.5 BTC' }), customer)?.link,
    ).toBe('/admin/approvals');
  });

  it('tells a customer’s deposit claim from an operator crediting it', () => {
    const claim = adminCopyFor(
      event({ kind: 'deposit-recorded', reference: 'claim-1', detail: 'claimed 50 USDT' }),
      customer,
    );
    const credit = adminCopyFor(
      event({ kind: 'deposit-recorded', reference: 'claim-1 by ops@example.com', detail: '50 USDT credited' }),
      customer,
    );
    expect(claim).toMatchObject({
      title: 'Deposit claim submitted',
      link: '/admin/approvals#claim-claim-1',
    });
    expect(credit).toMatchObject({ title: 'Deposit credited', link: '/admin/users/user-7' });
  });

  it('names the customer and where a sign-in came from', () => {
    const copy = adminCopyFor(
      event({ kind: 'sign-in', browser: 'Chrome', device: 'desktop', location: fix('Paris', 'FR') }),
      customer,
    );
    expect(copy?.body).toBe('ada@example.com · Chrome · desktop · Paris, FR');
  });

  it('copies every customer notification the bell shows, except what an operator sent', () => {
    for (const kind of NOTIFIABLE_KINDS) {
      const copy = adminCopyFor(event({ kind }), customer);
      // `wallet-unlinked` joins `receipt-sent` in being the customer's business
      // and not an operator's: severing a link takes a claim away, and a console
      // that announced every disconnection would be noise on the screen where a
      // *connection* needs to be noticed.
      if (kind === 'receipt-sent' || kind === 'wallet-unlinked') expect(copy).toBeNull();
      else expect(copy, kind).not.toBeNull();
    }
  });

  it('ignores what is not about a customer', () => {
    expect(adminCopyFor(event({ kind: 'page-view' }), customer)).toBeNull();
    expect(adminCopyFor(event({ kind: 'admin-suspended' }), customer)).toBeNull();
  });
});

/* The customer bell's kinds, restated so the test does not import the feed module
   and the database behind it. Kept in step with `NOTIFIABLE` by review. */
const NOTIFIABLE_KINDS = [
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
  'wallet-linked',
  'wallet-unlinked',
] as const;

/**
 * A visitor with no account.
 *
 * Most people on a public exchange are signed out, so this is the notification an
 * operator sees most often. It has no name to give, which makes the other three
 * facts — the page, the place and the browser — the whole of it.
 */
describe('visitorCopyFor', () => {
  const visit = {
    path: '/',
    visitorId: 'ctx-42',
    location: null,
    browser: null,
    device: null,
  };

  it('says where they landed, and sends the operator to the live board', () => {
    expect(visitorCopyFor(visit)).toEqual({
      title: 'Visitor online',
      body: 'on /',
      link: '/admin/live',
      tone: 'neutral',
      tag: 'visit-ctx-42',
    });
  });

  it('adds the place and the browser when the beat knew them', () => {
    const copy = visitorCopyFor({
      ...visit,
      path: '/markets',
      location: fix('Lagos', 'NG', 'device'),
      browser: 'Safari',
      device: 'mobile',
    });

    expect(copy.body).toBe('on /markets · Lagos, NG · Safari on mobile');
  });

  /* A place resolved from an address is a guess, and the console says so everywhere
     else. A notification that read the same for both would overstate it. */
  it('marks a place guessed from the address as approximate', () => {
    expect(visitorCopyFor({ ...visit, location: fix('Lagos', 'NG') }).body).toBe(
      'on / · near Lagos, NG',
    );
    expect(visitorCopyFor({ ...visit, location: fix('Lagos', 'NG', 'device') }).body).toBe(
      'on / · Lagos, NG',
    );
  });

  it('falls back to the region when no city was resolved, and to nothing at all', () => {
    expect(visitorCopyFor({ ...visit, location: fix(null, 'NG', 'network', 'Lagos State') }).body).toBe(
      'on / · near Lagos State, NG',
    );
    expect(visitorCopyFor({ ...visit, browser: 'Firefox' }).body).toBe('on / · Firefox');
  });

  /* One notification per visitor per device: a second landing from the same
     browsing context replaces the first rather than stacking under it. */
  it('tags the notification with the browsing context', () => {
    expect(visitorCopyFor({ ...visit, visitorId: 'ctx-9' }).tag).toBe('visit-ctx-9');
  });
});
