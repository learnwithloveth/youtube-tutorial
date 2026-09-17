import { describe, expect, it } from 'vitest';

import { bodyFor, pushFor, type DescribableEvent } from '../notification-copy';

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
        location: { city: 'Lagos', country: 'NG' },
      }),
    );

    expect(push?.body).toBe('Chrome · desktop · Lagos, NG');
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
