import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import type { ActivityEvent, ActivityKind } from '../../domain/event';
import { SECURITY_RETENTION_MS, SHORT_RETENTION_MS } from '../../domain/event';
import type { ActivityDependencies, ActivityRepository } from '../ports';
import { getUserActivity } from '../queries/user-activity';
import { createRecordActivity } from '../use-cases/record-activity';
import { createSweepActivity } from '../use-cases/sweep-activity';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111' as UserId;

class FakeEvents implements ActivityRepository {
  readonly store: ActivityEvent[] = [];
  private counter = 0;
  lastCutoffs: {
    ephemeralKinds: readonly ActivityKind[];
    ephemeral: Date;
    security: Date;
  } | null = null;

  nextId() {
    return `e${this.counter++}`;
  }
  async append(event: ActivityEvent) {
    this.store.push(event);
  }
  private scoped(userId: UserId, kinds?: readonly ActivityKind[] | undefined) {
    return this.store
      .filter((e) => e.userId === userId && (!kinds?.length || kinds.includes(e.kind)))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }
  async listForUser(query: {
    userId: UserId;
    kinds?: readonly ActivityKind[] | undefined;
    limit: number;
    offset: number;
  }) {
    return this.scoped(query.userId, query.kinds).slice(
      query.offset,
      query.offset + query.limit,
    );
  }
  async countForUser(userId: UserId, kinds?: readonly ActivityKind[] | undefined) {
    return this.scoped(userId, kinds).length;
  }
  async summariseUser(userId: UserId) {
    const byKind = new Map<ActivityKind, { total: number; lastAt: Date }>();
    for (const event of this.scoped(userId)) {
      const entry = byKind.get(event.kind);
      byKind.set(event.kind, {
        total: (entry?.total ?? 0) + 1,
        lastAt:
          entry === undefined || event.occurredAt > entry.lastAt
            ? event.occurredAt
            : entry.lastAt,
      });
    }
    return [...byKind.entries()].map(([kind, entry]) => ({ kind, ...entry }));
  }
  async listRecent(query: {
    kinds?: readonly ActivityKind[] | undefined;
    limit: number;
    offset: number;
  }) {
    return this.store
      .filter(
        (event) =>
          query.kinds === undefined ||
          query.kinds.length === 0 ||
          query.kinds.includes(event.kind),
      )
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(query.offset, query.offset + query.limit);
  }
  async countRecent(kinds?: readonly ActivityKind[] | undefined) {
    return this.store.filter(
      (event) => kinds === undefined || kinds.length === 0 || kinds.includes(event.kind),
    ).length;
  }
  async tallyByDay(query: { since: Date; kinds?: readonly ActivityKind[] | undefined }) {
    const counted = new Map<string, number>();
    for (const event of this.store) {
      if (event.occurredAt < query.since) continue;
      if (query.kinds !== undefined && query.kinds.length > 0 && !query.kinds.includes(event.kind)) {
        continue;
      }
      const day = event.occurredAt.toISOString().slice(0, 10);
      counted.set(day, (counted.get(day) ?? 0) + 1);
    }
    return [...counted.entries()]
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  async topPathsForUser(userId: UserId, limit: number) {
    const byPath = new Map<string, { views: number; totalSeconds: number }>();
    for (const event of this.scoped(userId, ['page-view'])) {
      if (event.path === null) continue;
      const entry = byPath.get(event.path) ?? { views: 0, totalSeconds: 0 };
      byPath.set(event.path, {
        views: entry.views + 1,
        totalSeconds: entry.totalSeconds + (event.durationSeconds ?? 0),
      });
    }
    return [...byPath.entries()]
      .map(([path, entry]) => ({ path, ...entry }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }
  async deleteExpired(
    cutoffs: { ephemeralKinds: readonly ActivityKind[]; ephemeral: Date; security: Date },
    limit: number,
  ) {
    this.lastCutoffs = cutoffs;
    const doomed = this.store.filter((event) =>
      cutoffs.ephemeralKinds.includes(event.kind)
        ? event.occurredAt < cutoffs.ephemeral
        : event.occurredAt < cutoffs.security,
    );
    for (const event of doomed.slice(0, limit)) {
      this.store.splice(this.store.indexOf(event), 1);
    }
    return Math.min(doomed.length, limit);
  }
}

function build() {
  const events = new FakeEvents();
  const deps: ActivityDependencies = { events, clock: fixedClock(NOW) };
  return { events, deps, record: createRecordActivity(deps) };
}

describe('recordActivity', () => {
  it('stamps the clock when no time is supplied', async () => {
    const { events, record } = build();
    await record({ userId: USER, kind: 'sign-in' });
    expect(events.store[0]?.occurredAt).toEqual(NOW);
  });

  it('keeps a supplied time, which is how a page view is dated to its arrival', async () => {
    const { events, record } = build();
    const arrived = new Date(NOW.getTime() - 120_000);

    await record({
      userId: USER,
      kind: 'page-view',
      path: '/markets',
      occurredAt: arrived,
      durationSeconds: 120,
    });

    expect(events.store[0]?.occurredAt).toEqual(arrived);
  });

  /* A tab left open over a weekend produces a true and useless dwell that would
     dominate every "time spent" total and say only that a laptop was closed. */
  it('caps an implausible dwell time', async () => {
    const { events, record } = build();
    await record({
      userId: USER,
      kind: 'page-view',
      path: '/markets',
      durationSeconds: 60 * 60 * 24 * 3,
    });
    expect(events.store[0]?.durationSeconds).toBe(12 * 60 * 60);
  });

  it('discards a nonsensical duration rather than storing it', async () => {
    const { events, record } = build();
    await record({
      userId: USER,
      kind: 'page-view',
      path: '/markets',
      durationSeconds: Number.NaN,
    });
    expect(events.store[0]?.durationSeconds).toBeNull();
  });
});

describe('getUserActivity', () => {
  it('tallies, ranks routes and groups devices from one history', async () => {
    const { events, deps, record } = build();

    await record({ userId: USER, kind: 'page-view', path: '/markets', durationSeconds: 30 });
    await record({ userId: USER, kind: 'page-view', path: '/markets', durationSeconds: 90 });
    await record({ userId: USER, kind: 'page-view', path: '/trade', durationSeconds: 10 });
    await record({
      userId: USER,
      kind: 'sign-in',
      agent: { device: 'desktop', browser: 'Firefox' },
      ipDigest: 'aaa',
    });
    await record({
      userId: USER,
      kind: 'sign-in',
      agent: { device: 'desktop', browser: 'Firefox' },
      ipDigest: 'aaa',
    });
    await record({
      userId: USER,
      kind: 'sign-in',
      agent: { device: 'mobile', browser: 'Safari' },
      ipDigest: 'bbb',
    });

    const result = await getUserActivity(deps.events, USER);

    expect(result.degraded).toBe(false);
    expect(result.tallies.find((t) => t.kind === 'page-view')?.total).toBe(3);
    expect(result.tallies.find((t) => t.kind === 'sign-in')?.total).toBe(3);

    expect(result.topPaths[0]).toEqual({ path: '/markets', views: 2, totalSeconds: 120 });

    // Two sign-ins from one machine collapse; the phone stays its own row.
    expect(result.devices).toHaveLength(2);
    expect(result.devices.find((d) => d.browser === 'Firefox')?.signIns).toBe(2);

    expect(events.store).toHaveLength(6);
  });

  /* An empty history because someone has done nothing and an empty history
     because the query failed are different facts.

     Every method rejects, which is the realistic shape of the failure — the
     database is unreachable, so all five parallel reads fail, not one. That is
     also what exposed the bug this guards: `Promise.all` surfaces the first
     rejection and leaves the other four unattached, and Node terminates the
     process on an unhandled rejection by default. A test that broke only one
     method passed against the broken version. */
  it('survives every read failing, and reports it as degraded', async () => {
    const refuse = async (): Promise<never> => {
      throw new Error('connection refused');
    };
    const broken: ActivityRepository = {
      nextId: () => 'x',
      append: refuse,
      listForUser: refuse,
      countForUser: refuse,
      summariseUser: refuse,
      topPathsForUser: refuse,
      listRecent: refuse,
      countRecent: refuse,
      tallyByDay: refuse,
      deleteExpired: refuse,
    };

    const result = await getUserActivity(broken, USER);

    expect(result.degraded).toBe(true);
    expect(result.recent.events).toEqual([]);
  });

  /* Partial failure costs the panel that failed, not the page. */
  it('still renders the timeline when a side panel fails', async () => {
    const { events, record } = build();
    await record({ userId: USER, kind: 'page-view', path: '/markets', durationSeconds: 5 });

    const partial: ActivityRepository = Object.assign(Object.create(events), {
      topPathsForUser: async (): Promise<never> => {
        throw new Error('aggregate timed out');
      },
    }) as ActivityRepository;

    const result = await getUserActivity(partial, USER);

    expect(result.degraded).toBe(false);
    expect(result.recent.events).toHaveLength(1);
    expect(result.topPaths).toEqual([]);
  });

  it('scopes a filtered view to the kinds asked for', async () => {
    const { deps, record } = build();
    await record({ userId: USER, kind: 'page-view', path: '/markets' });
    await record({ userId: USER, kind: 'sign-in' });

    const result = await getUserActivity(deps.events, USER, { kinds: ['sign-in'] });

    expect(result.recent.total).toBe(1);
    expect(result.recent.events[0]?.kind).toBe('sign-in');
  });
});

describe('sweepActivity', () => {
  it('applies a different cut-off to each kind', async () => {
    const { events, deps, record } = build();

    const oldPageView = new Date(NOW.getTime() - SHORT_RETENTION_MS - 1000);
    const oldSignIn = new Date(NOW.getTime() - SECURITY_RETENTION_MS - 1000);
    // Past the short window but well inside the security one.
    const middling = new Date(NOW.getTime() - SHORT_RETENTION_MS - 1000);

    await record({ userId: USER, kind: 'page-view', path: '/a', occurredAt: oldPageView });
    await record({ userId: USER, kind: 'sign-in', occurredAt: middling });
    await record({ userId: USER, kind: 'sign-in', occurredAt: oldSignIn });
    await record({ userId: USER, kind: 'page-view', path: '/b' });

    const removed = await createSweepActivity(deps)();

    expect(removed).toBe(2);
    // The sign-in from just past the short window survives; that is the whole
    // reason there are two cut-offs.
    expect(events.store.map((e) => e.kind).sort()).toEqual(['page-view', 'sign-in']);
    expect(events.store.some((e) => e.occurredAt.getTime() === middling.getTime())).toBe(true);
  });
});
