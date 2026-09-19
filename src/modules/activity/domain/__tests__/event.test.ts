import { describe, expect, it } from 'vitest';

import type { UserId } from '@/shared/kernel/ids';

import {
  ActivityEvent,
  EPHEMERAL_KINDS,
  isSecurityKind,
  SHORT_RETENTION_MS,
  retentionMsFor,
  SECURITY_KINDS,
  SECURITY_RETENTION_MS,
  type ActivityKind,
} from '../event';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111' as UserId;

function build(overrides: Partial<Parameters<typeof ActivityEvent.record>[0]> = {}) {
  return ActivityEvent.record({
    id: 'e1',
    userId: USER,
    kind: 'page-view',
    occurredAt: NOW,
    path: '/markets',
    durationSeconds: 42,
    reference: null,
    detail: null,
    location: null,
    agent: null,
    ipDigest: null,
    visitorId: null,
    ...overrides,
  });
}

describe('recording an event', () => {
  it('keeps what it was given', () => {
    const event = build();
    expect(event.path).toBe('/markets');
    expect(event.durationSeconds).toBe(42);
    expect(event.occurredAt).toEqual(NOW);
  });

  /* A page view with no route describes nothing, which is a bug in the caller
     rather than a state worth storing. */
  it('refuses a page view with no path', () => {
    expect(() => build({ path: null })).toThrow(TypeError);
  });

  it('refuses an invalid time', () => {
    expect(() => build({ occurredAt: new Date('nonsense') })).toThrow(TypeError);
  });

  it('refuses a negative duration', () => {
    expect(() => build({ durationSeconds: -1 })).toThrow(RangeError);
  });

  it('allows a security event with no path', () => {
    const event = build({ kind: 'sign-in', path: null, durationSeconds: null });
    expect(event.path).toBeNull();
    expect(event.isSecurityEvent).toBe(true);
  });

  /* There are no setters, by design. A correction to an audit trail is a new
     event, never a rewrite of an old one — and the cheapest way to guarantee that
     is for the aggregate to expose no way to change itself. */
  it('exposes no mutators', () => {
    const event = build();
    const mutators = Object.getOwnPropertyNames(Object.getPrototypeOf(event)).filter(
      (name) => name.startsWith('set') || name.startsWith('update'),
    );
    expect(mutators).toEqual([]);
  });
});

describe('retention', () => {
  /* The split is the whole point. A sign-in from an unfamiliar country matters
     when a dispute surfaces months later; a record that someone read the fees page
     stops being useful almost immediately and is the more intrusive of the two to
     keep. One window would force a choice between losing the first and hoarding
     the second. */
  it('keeps security events far longer than page views', () => {
    expect(retentionMsFor('page-view')).toBe(SHORT_RETENTION_MS);
    expect(SECURITY_RETENTION_MS).toBeGreaterThan(SHORT_RETENTION_MS);

    for (const kind of SECURITY_KINDS) {
      expect(retentionMsFor(kind)).toBe(SECURITY_RETENTION_MS);
    }
  });

  it('classifies the ephemeral kinds out of the security set', () => {
    for (const kind of EPHEMERAL_KINDS) {
      expect(isSecurityKind(kind)).toBe(false);
      expect(retentionMsFor(kind)).toBe(SHORT_RETENTION_MS);
    }
    for (const kind of SECURITY_KINDS) {
      expect(isSecurityKind(kind)).toBe(true);
    }
  });

  /* Guards against a kind being added to the union and silently inheriting the
     one-year window without anyone deciding it should. It has already earned
     its keep once: `price-alert-triggered` would have been kept for a year. */
  it('covers every kind in the union', () => {
    const all: ActivityKind[] = [
      'page-view',
      'sign-up',
      'sign-in',
      'sign-out',
      'password-reset',
      'verification-sent',
      'email-verified',
      'withdrawal-requested',
      'withdrawal-approved',
      'withdrawal-rejected',
      'deposit-recorded',
      'deposit-rejected',
      'demo-funds-granted',
      'admin-suspended',
      'admin-reinstated',
      'receipt-sent',
      'verification-submitted',
      'verification-approved',
      'verification-rejected',
      'price-alert-triggered',
      'visit-started',
      'support-message-sent',
    ];
    expect(new Set([...SECURITY_KINDS, ...EPHEMERAL_KINDS])).toEqual(new Set(all));
  });

  it('expires from when the event happened, not when it was written', () => {
    const event = build({ kind: 'sign-in', path: null, durationSeconds: null });
    expect(event.expiresAt()).toEqual(new Date(NOW.getTime() + SECURITY_RETENTION_MS));
  });
});
