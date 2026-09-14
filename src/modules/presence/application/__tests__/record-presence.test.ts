import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock, type Clock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import {
  Coordinates,
  LocationFix,
  MAX_FIX_AGE_SECONDS,
  NOWHERE,
  type Place,
} from '../../domain/location';
import { HEARTBEAT_INTERVAL_MS, type Presence, type VisitorId } from '../../domain/presence';
import type {
  AgentParser,
  LocationResolver,
  NetworkContext,
  PresenceDependencies,
  PresenceRepository,
} from '../ports';
import { createRecordPresence } from '../use-cases/record-presence';
import { createSweepPresence } from '../use-cases/sweep-presence';

/**
 * The application layer, exercised with no database and no network.
 *
 * Which is the point of the ports pointing the way they do: everything below is a
 * fake built in this file, the clock is fixed, and a failure here always means a
 * rule was broken rather than that a service was down.
 */

const NOW = new Date('2026-09-14T12:00:00.000Z');
const VISITOR = '7f3a1c22-0b6e-4f1a-9c3d-8a1b2c3d4e5f';
const OTHER_VISITOR = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ALICE = '11111111-1111-4111-8111-111111111111' as UserId;
const BOB = '22222222-2222-4222-8222-222222222222' as UserId;

class FakePresences implements PresenceRepository {
  readonly store = new Map<string, Presence>();
  deleted = 0;

  async find(id: VisitorId) {
    return this.store.get(id) ?? null;
  }
  async save(presence: Presence) {
    this.store.set(presence.id, presence);
  }
  async listSince(since: Date, limit: number) {
    return [...this.store.values()]
      .filter((presence) => presence.lastSeenAt >= since)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, limit);
  }
  async listForUser(userId: UserId, since: Date, limit: number) {
    const all = await this.listSince(since, Number.MAX_SAFE_INTEGER);
    return all.filter((presence) => presence.userId === userId).slice(0, limit);
  }
  async deleteExpired(before: Date, limit: number) {
    const doomed = [...this.store.values()]
      .filter((presence) => presence.lastSeenAt < before)
      .slice(0, limit);
    for (const presence of doomed) this.store.delete(presence.id);
    this.deleted += doomed.length;
    return doomed.length;
  }
}

class CountingLocator implements LocationResolver {
  calls = 0;
  constructor(private readonly place: Place | null = AUSTIN) {}

  async resolve(_network: NetworkContext, observedAt: Date) {
    this.calls += 1;
    if (this.place === null) return null;
    return LocationFix.fromAddress({ source: 'network', place: this.place, observedAt });
  }
}

const AUSTIN: Place = { city: 'Austin', region: 'Texas', country: 'US', timezone: null };

const agents: AgentParser = {
  parse: (userAgent) =>
    userAgent === null ? null : { device: 'desktop', browser: 'Firefox' },
};

/**
 * A stand-in digest that does not echo its input.
 *
 * A fake like `` `digest:${value}` `` would be simpler and would make the test
 * below meaningless: the assertion is that no stored field contains the address,
 * and a fake that embeds it cannot distinguish code that hashes from code that
 * does not.
 */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const NETWORK: NetworkContext = {
  ip: '203.0.113.9',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/141.0',
  hints: {},
};

function build(overrides: Partial<PresenceDependencies> = {}) {
  const presences = new FakePresences();
  const locations = new CountingLocator();
  const clock: Clock = fixedClock(NOW);

  const deps: PresenceDependencies = {
    presences,
    locations,
    agents,
    digest: { hash: fnv1a },
    clock,
    ...overrides,
  };

  return { deps, presences, locations, clock };
}

function report(overrides: Record<string, unknown> = {}) {
  return { visitorId: VISITOR, path: '/markets', ...overrides };
}

describe('recordPresence', () => {
  let context: ReturnType<typeof build>;

  beforeEach(() => {
    context = build();
  });

  it('creates a row for a visitor it has not seen', async () => {
    const record = createRecordPresence(context.deps);

    const result = await record({ report: report(), userId: null, network: NETWORK });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nextBeatMs).toBe(HEARTBEAT_INTERVAL_MS);

    const stored = context.presences.store.get(VISITOR);
    expect(stored?.path).toBe('/markets');
    expect(stored?.userId).toBeNull();
    expect(stored?.location?.place.city).toBe('Austin');
  });

  /* The whole reason the endpoint can be public. The report has no user field at
     all; the id comes from the session the caller already resolved. */
  it('takes the user from the caller, never from the report', async () => {
    const record = createRecordPresence(context.deps);

    await record({
      report: report({ userId: BOB, visitorId: VISITOR }),
      userId: ALICE,
      network: NETWORK,
    });

    expect(context.presences.store.get(VISITOR)?.userId).toBe(ALICE);
  });

  it('refuses a report for a context that belongs to another account', async () => {
    const record = createRecordPresence(context.deps);
    await record({ report: report(), userId: ALICE, network: NETWORK });

    const result = await record({ report: report(), userId: BOB, network: NETWORK });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('visitor-unknown');
    // Refused means nothing written — the row still belongs to Alice.
    expect(context.presences.store.get(VISITOR)?.userId).toBe(ALICE);
  });

  it('lets an anonymous context be claimed by whoever signs in', async () => {
    const record = createRecordPresence(context.deps);
    await record({ report: report(), userId: null, network: NETWORK });

    const result = await record({ report: report(), userId: ALICE, network: NETWORK });

    expect(result.ok).toBe(true);
    expect(context.presences.store.get(VISITOR)?.userId).toBe(ALICE);
  });

  describe('validation', () => {
    it('rejects a visitor id that is not a UUID', async () => {
      const record = createRecordPresence(context.deps);
      const result = await record({
        report: report({ visitorId: 'not-a-uuid' }),
        userId: null,
        network: NETWORK,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('report-invalid');
      expect(context.presences.store.size).toBe(0);
    });

    it('rejects a path that is not a same-origin route', async () => {
      const record = createRecordPresence(context.deps);
      const result = await record({
        report: report({ path: 'https://evil.example/markets' }),
        userId: null,
        network: NETWORK,
      });

      expect(result.ok).toBe(false);
      expect(context.presences.store.size).toBe(0);
    });

    /* A live board must never become a way to read a verification token off an
       operator's screen. */
    it('stores the route without its query string', async () => {
      const record = createRecordPresence(context.deps);
      await record({
        report: report({ path: '/reset-password?token=super-secret' }),
        userId: null,
        network: NETWORK,
      });

      expect(context.presences.store.get(VISITOR)?.path).toBe('/reset-password');
    });
  });

  describe('the address lookup', () => {
    it('is skipped while a live fix from the same address is already held', async () => {
      const record = createRecordPresence(context.deps);

      await record({ report: report(), userId: null, network: NETWORK });
      expect(context.locations.calls).toBe(1);

      await record({ report: report(), userId: null, network: NETWORK });
      await record({ report: report(), userId: null, network: NETWORK });
      expect(context.locations.calls).toBe(1);
    });

    it('runs again when the connecting address changes', async () => {
      const record = createRecordPresence(context.deps);
      await record({ report: report(), userId: null, network: NETWORK });

      await record({
        report: report(),
        userId: null,
        network: { ...NETWORK, ip: '198.51.100.7' },
      });

      expect(context.locations.calls).toBe(2);
    });

    it('leaves the location unavailable when nothing resolves', async () => {
      const locations = new CountingLocator(null);
      const local = build({ locations });
      const record = createRecordPresence(local.deps);

      await record({ report: report(), userId: null, network: NETWORK });

      const stored = local.presences.store.get(VISITOR);
      expect(stored?.location).toBeNull();
      expect(stored?.locationStateAt(local.clock)).toEqual({ kind: 'unavailable' });
    });

    it('never stores the address itself, only a keyed digest', async () => {
      const record = createRecordPresence(context.deps);
      await record({ report: report(), userId: null, network: NETWORK });

      const stored = context.presences.store.get(VISITOR);
      expect(stored?.ipDigest).toBe(fnv1a('203.0.113.9'));
      expect(JSON.stringify(stored?.toSnapshot())).not.toContain('203.0.113.9');
    });
  });

  describe('a device fix', () => {
    const device = {
      latitude: 30.2672,
      longitude: -97.7431,
      accuracyMetres: 18,
      observedAt: NOW.toISOString(),
    };

    it('is preferred over the address fix and survives later beats', async () => {
      const record = createRecordPresence(context.deps);

      await record({ report: report({ device }), userId: null, network: NETWORK });
      expect(context.presences.store.get(VISITOR)?.location?.source).toBe('device');

      // A beat with no device fix must not let the address fix take over.
      await record({ report: report(), userId: null, network: NETWORK });
      expect(context.presences.store.get(VISITOR)?.location?.source).toBe('device');
    });

    it('is ignored when the coordinates are unusable', async () => {
      const record = createRecordPresence(context.deps);

      await record({
        report: report({ device: { ...device, latitude: 999 } }),
        userId: null,
        network: NETWORK,
      });

      expect(context.presences.store.get(VISITOR)?.location?.source).toBe('network');
    });

    /* A client that claims a fix from tomorrow would otherwise win every freshness
       comparison forever, and one claiming last week would be shown as current.
       Both are clamped against the module's clock — never `Date.now()`, which is a
       different value whenever the process and the device disagree. */
    it('clamps an observation time from the future to now', async () => {
      const record = createRecordPresence(context.deps);

      await record({
        report: report({ device: { ...device, observedAt: '2099-01-01T00:00:00.000Z' } }),
        userId: null,
        network: NETWORK,
      });

      expect(context.presences.store.get(VISITOR)?.location?.observedAt).toEqual(NOW);
    });

    it('clamps an observation time from the distant past to the staleness floor', async () => {
      const record = createRecordPresence(context.deps);

      await record({
        report: report({ device: { ...device, observedAt: '2020-01-01T00:00:00.000Z' } }),
        userId: null,
        network: NETWORK,
      });

      const observed = context.presences.store.get(VISITOR)?.location?.observedAt;
      expect(observed).toEqual(new Date(NOW.getTime() - MAX_FIX_AGE_SECONDS * 1000));
    });

    /* The regression that motivated passing the clock in. With the wall clock, a
       server running behind the visitor's device clamps a good fix into staleness,
       and the very next address lookup replaces a consented GPS position with a
       city guessed from an IP address. */
    it('keeps a fix the device timestamped slightly ahead of the server', async () => {
      const record = createRecordPresence(context.deps);
      const ahead = new Date(NOW.getTime() + 90_000).toISOString();

      await record({
        report: report({ device: { ...device, observedAt: ahead } }),
        userId: null,
        network: NETWORK,
      });
      await record({ report: report(), userId: null, network: NETWORK });

      const stored = context.presences.store.get(VISITOR);
      expect(stored?.location?.source).toBe('device');
      expect(stored?.locationStateAt(context.clock).kind).toBe('live');
    });
  });

  describe('leaving', () => {
    it('marks the context gone without asking anyone where it is', async () => {
      const record = createRecordPresence(context.deps);
      await record({ report: report(), userId: null, network: NETWORK });
      const callsBefore = context.locations.calls;

      const result = await record({
        report: report({ event: 'leave' }),
        userId: null,
        network: NETWORK,
      });

      expect(result.ok).toBe(true);
      expect(context.presences.store.get(VISITOR)?.departedAt).toEqual(NOW);
      expect(context.presences.store.get(VISITOR)?.activityAt(context.clock)).toBe('gone');
      expect(context.locations.calls).toBe(callsBefore);
    });
  });
});

describe('sweepPresence', () => {
  it('deletes only what is past the retention window', async () => {
    const context = build();
    const record = createRecordPresence(context.deps);

    await record({ report: report(), userId: null, network: NETWORK });
    await record({
      report: report({ visitorId: OTHER_VISITOR }),
      userId: null,
      network: NETWORK,
    });

    // Nothing has aged yet, so a sweep at the same instant must remove nothing.
    expect(await createSweepPresence(context.deps)()).toBe(0);
    expect(context.presences.store.size).toBe(2);

    const later = build({ presences: context.presences, clock: fixedClock(
      new Date(NOW.getTime() + 7 * 60 * 60_000),
    ) });
    expect(await createSweepPresence(later.deps)()).toBe(2);
    expect(context.presences.store.size).toBe(0);
  });
});

describe('a fix with nothing in it', () => {
  /* Guards the invariant the whole location model rests on: there is no way to
     construct a fix that asserts nothing. */
  it('cannot be constructed', () => {
    expect(
      LocationFix.fromAddress({ source: 'network', place: NOWHERE, observedAt: NOW }),
    ).toBeNull();
    expect(Coordinates.parse(undefined, undefined)).toBeNull();
  });
});
