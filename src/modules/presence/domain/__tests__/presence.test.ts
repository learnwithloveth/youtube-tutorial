import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { Coordinates, LocationFix } from '../location';
import {
  ACTIVE_WINDOW_MS,
  IDLE_WINDOW_MS,
  MAX_PATH_LENGTH,
  normalisePath,
  Presence,
  type VisitorId,
} from '../presence';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const clock = fixedClock(NOW);

const VISITOR = '7f3a1c22-0b6e-4f1a-9c3d-8a1b2c3d4e5f' as VisitorId;
const USER = '11111111-1111-4111-8111-111111111111' as UserId;
const OTHER = '22222222-2222-4222-8222-222222222222' as UserId;

function at(msAgo: number): Date {
  return new Date(NOW.getTime() - msAgo);
}

function begin(overrides: Partial<Parameters<typeof Presence.begin>[0]> = {}): Presence {
  return Presence.begin({
    id: VISITOR,
    userId: null,
    path: '/markets',
    engagement: 'engaged',
    agent: { device: 'desktop', browser: 'Firefox' },
    ipDigest: 'digest-a',
    now: NOW,
    ...overrides,
  });
}

describe('normalisePath', () => {
  it('keeps an ordinary route', () => {
    expect(normalisePath('/markets/bitcoin')).toBe('/markets/bitcoin');
    expect(normalisePath('/')).toBe('/');
  });

  /* The reason this function exists. `/verify-email?token=…` and
     `/reset-password?token=…` carry single-use credentials; storing the full URL
     would put account-takeover material on a screen an operator reads. */
  it('drops the query string and the fragment', () => {
    expect(normalisePath('/reset-password?token=secret-value')).toBe('/reset-password');
    expect(normalisePath('/verify-email?token=abc&next=/app')).toBe('/verify-email');
    expect(normalisePath('/markets#chart')).toBe('/markets');
  });

  it('refuses anything that is not a same-origin path', () => {
    expect(normalisePath('https://evil.example/markets')).toBeNull();
    expect(normalisePath('//evil.example/markets')).toBeNull();
    expect(normalisePath('markets')).toBeNull();
    expect(normalisePath('')).toBeNull();
    expect(normalisePath(null)).toBeNull();
    expect(normalisePath(42)).toBeNull();
  });

  it('refuses control characters and over-long paths', () => {
    expect(normalisePath('/markets\n/injected')).toBeNull();
    expect(normalisePath(`/${'a'.repeat(MAX_PATH_LENGTH)}`)).toBeNull();
  });

  /* Otherwise `/markets` and `/markets/` count as two pages on the board. */
  it('collapses a trailing slash', () => {
    expect(normalisePath('/markets/')).toBe('/markets');
    expect(normalisePath('/markets///')).toBe('/markets');
  });
});

describe('activity', () => {
  it('is active while beating and engaged', () => {
    expect(begin().activityAt(clock)).toBe('active');
  });

  it('is idle as soon as the tab reports itself backgrounded', () => {
    const presence = begin();
    presence.record({ now: NOW, path: '/markets', engagement: 'backgrounded' });
    expect(presence.activityAt(clock)).toBe('idle');
  });

  /* Browsers clamp timers in hidden tabs and fire nothing at all on a sleeping
     machine, so late beats are expected. A window tight enough to look accurate
     would drop visitors who are still there and put them back seconds later. */
  it('is idle, not gone, once beats fall behind the active window', () => {
    const presence = begin({ now: at(ACTIVE_WINDOW_MS + 1_000) });
    expect(presence.activityAt(clock)).toBe('idle');
  });

  it('is gone past the idle window', () => {
    const presence = begin({ now: at(IDLE_WINDOW_MS + 1_000) });
    expect(presence.activityAt(clock)).toBe('gone');
  });

  it('is gone the moment the tab says it is closing', () => {
    const presence = begin();
    presence.depart(NOW);
    expect(presence.activityAt(clock)).toBe('gone');
  });

  /* `pagehide` fires on every bfcache navigation, so a departure followed by more
     beats is the ordinary case rather than an anomaly. */
  it('comes back when a departed context beats again', () => {
    const presence = begin();
    presence.depart(NOW);
    presence.record({ now: NOW, path: '/markets', engagement: 'engaged' });
    expect(presence.activityAt(clock)).toBe('active');
    expect(presence.departedAt).toBeNull();
  });
});

describe('recording a beat', () => {
  it('counts a page view only when the path changed', () => {
    const presence = begin();
    presence.record({ now: NOW, path: '/markets', engagement: 'engaged' });
    presence.record({ now: NOW, path: '/markets', engagement: 'engaged' });
    expect(presence.pageViews).toBe(1);

    presence.record({ now: NOW, path: '/trade', engagement: 'engaged' });
    expect(presence.pageViews).toBe(2);
    expect(presence.path).toBe('/trade');
  });

  it('measures dwell from arrival on the current page, not from the session', () => {
    const presence = begin({ now: at(600_000) });
    presence.record({ now: at(30_000), path: '/trade', engagement: 'engaged' });

    expect(presence.secondsOnPageAt(clock)).toBe(30);
    expect(presence.sessionSecondsAt(clock)).toBe(600);
  });

  it('keeps the arrival time while the path is unchanged', () => {
    const presence = begin({ now: at(120_000) });
    presence.record({ now: NOW, path: '/markets', engagement: 'engaged' });
    expect(presence.secondsOnPageAt(clock)).toBe(120);
  });
});

describe('identity', () => {
  it('gains and changes a user, because a tab can sign in and out', () => {
    const presence = begin();
    expect(presence.userId).toBeNull();

    presence.identify(USER);
    expect(presence.userId).toBe(USER);

    presence.identify(OTHER);
    expect(presence.userId).toBe(OTHER);

    presence.identify(null);
    expect(presence.userId).toBeNull();
  });
});

describe('location', () => {
  it('reports unavailable until something resolves', () => {
    expect(begin().locationStateAt(clock)).toEqual({ kind: 'unavailable' });
  });

  it('reports live, then stale, as a fix ages', () => {
    const presence = begin();
    presence.locate(cityFix(NOW), clock);
    expect(presence.locationStateAt(clock).kind).toBe('live');

    const aged = begin();
    aged.locate(cityFix(at(3_600_000)), clock);
    const state = aged.locationStateAt(clock);
    expect(state.kind).toBe('stale');
    if (state.kind === 'stale') expect(state.ageSeconds).toBe(3600);
  });

  /* The rule that makes precise location usable at all: an address fix arrives on
     every beat and a device fix does not, so last-writer-wins would discard a
     consented GPS position twenty seconds after it arrived. */
  it('does not let a routine address fix displace a device fix', () => {
    const presence = begin();
    expect(presence.locate(deviceFix(NOW), clock)).toBe(true);
    expect(presence.locate(cityFix(NOW), clock)).toBe(false);
    expect(presence.location?.source).toBe('device');
  });
});

function cityFix(observedAt: Date): LocationFix {
  return LocationFix.fromAddress({
    source: 'network',
    place: { city: 'Austin', region: 'Texas', country: 'US', timezone: null },
    observedAt,
  })!;
}

function deviceFix(observedAt: Date): LocationFix {
  return LocationFix.device({
    coordinates: Coordinates.parse(30.2672, -97.7431)!,
    observedAt,
  });
}
