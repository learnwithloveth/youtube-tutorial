import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';
import type { UserId } from '@/shared/kernel/ids';

import { PriceAlert, parseTarget } from '../../domain/price-alert';
import { createEvaluateAlerts } from '../use-cases/evaluate-alerts';
import { createCreateAlert } from '../use-cases/manage-alerts';
import type { AlertDependencies, PriceAlertRepository } from '../ports';

const USER = 'user_1' as UserId;
const NOW = new Date('2026-09-15T12:00:00Z');

class FakeAlerts implements PriceAlertRepository {
  readonly store = new Map<string, PriceAlert>();
  /** Ids that refuse to save, to exercise the partial-failure path. */
  readonly unwritable = new Set<string>();
  private sequence = 0;

  nextId(): string {
    this.sequence += 1;
    return `al_${this.sequence}`;
  }

  async save(alert: PriceAlert): Promise<void> {
    if (this.unwritable.has(alert.id)) throw new Error('row refused');
    this.store.set(alert.id, alert);
  }

  async find(id: string): Promise<PriceAlert | null> {
    return this.store.get(id) ?? null;
  }

  async remove(id: string, userId: UserId): Promise<boolean> {
    const found = this.store.get(id);
    if (found === undefined || found.userId !== userId) return false;
    this.store.delete(id);
    return true;
  }

  async listForUser(userId: UserId): Promise<PriceAlert[]> {
    return [...this.store.values()].filter((alert) => alert.userId === userId);
  }

  async countForUser(userId: UserId): Promise<number> {
    return (await this.listForUser(userId)).length;
  }

  async listArmed(limit: number): Promise<PriceAlert[]> {
    return [...this.store.values()].filter((alert) => alert.isArmed).slice(0, limit);
  }
}

function makeDeps() {
  const alerts = new FakeAlerts();
  const deps = {
    alerts,
    reads: { lastReadAt: async () => null, markReadAt: async () => undefined },
    clock: fixedClock(NOW),
  } satisfies AlertDependencies;
  return { deps, alerts };
}

function seed(alerts: FakeAlerts, symbol: string, direction: 'above' | 'below', target: string) {
  const alert = PriceAlert.create({
    id: alerts.nextId(),
    userId: USER,
    symbol,
    direction,
    target: parseTarget(target),
    now: NOW,
  });
  alerts.store.set(alert.id, alert);
  return alert;
}

describe('evaluating against fresh prices', () => {
  it('fires only the alerts the prices satisfy', async () => {
    const { deps, alerts } = makeDeps();
    const hit = seed(alerts, 'BTC', 'above', '100000');
    const miss = seed(alerts, 'ETH', 'above', '9000');

    const result = await createEvaluateAlerts(deps)({
      prices: new Map([
        ['BTC', '100000.01'],
        ['ETH', '4480.00'],
      ]),
    });

    expect(result.triggered.map((t) => t.alertId)).toEqual([hit.id]);
    expect(alerts.store.get(hit.id)?.status).toBe('triggered');
    expect(alerts.store.get(miss.id)?.status).toBe('armed');
  });

  it('leaves an alert armed when its symbol has no quote in the batch', async () => {
    // Not a miss and not an error: the market simply was not in this refresh, and
    // the alert is looked at again on the next one. Treating it as evaluated would
    // silently never fire it.
    const { deps, alerts } = makeDeps();
    const waiting = seed(alerts, 'TAO', 'below', '520');

    const result = await createEvaluateAlerts(deps)({ prices: new Map([['BTC', '100000']]) });

    expect(result.triggered).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(alerts.store.get(waiting.id)?.status).toBe('armed');
  });

  it('reports the exact target and price the customer is told', async () => {
    const { deps, alerts } = makeDeps();
    seed(alerts, 'SHIB', 'above', '0.00002341');

    const result = await createEvaluateAlerts(deps)({
      prices: new Map([['SHIB', '0.00002350']]),
    });

    expect(result.triggered[0]?.target).toBe('0.00002341');
    expect(result.triggered[0]?.price).toBe('0.0000235');
  });

  it('does not report an alert whose row would not save', async () => {
    // Telling somebody an alert fired when the row did not move means it fires
    // again on the next pass — two notifications for one crossing.
    const { deps, alerts } = makeDeps();
    const broken = seed(alerts, 'BTC', 'above', '100000');
    const fine = seed(alerts, 'ETH', 'above', '4000');
    alerts.unwritable.add(broken.id);

    const result = await createEvaluateAlerts(deps)({
      prices: new Map([
        ['BTC', '100001'],
        ['ETH', '4480'],
      ]),
    });

    expect(result.triggered.map((t) => t.alertId)).toEqual([fine.id]);
    expect(result.skipped).toBe(1);
  });

  it('ignores a price string that is not a decimal', async () => {
    const { deps, alerts } = makeDeps();
    const waiting = seed(alerts, 'BTC', 'above', '100000');

    const result = await createEvaluateAlerts(deps)({ prices: new Map([['BTC', 'n/a']]) });

    expect(result.triggered).toEqual([]);
    expect(alerts.store.get(waiting.id)?.status).toBe('armed');
  });
});

describe('creating an alert', () => {
  const KNOWN = ['BTC', 'ETH'];

  it('refuses a symbol this platform does not quote', async () => {
    // One of these would sit armed forever, and the customer would read that as
    // the alert system being broken rather than as a market that is not listed.
    const { deps } = makeDeps();
    const result = await createCreateAlert(deps)({
      userId: USER,
      symbol: 'DOGE',
      direction: 'above',
      target: '1',
      knownSymbols: KNOWN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('symbol-unknown');
  });

  it('refuses a second identical alert', async () => {
    const { deps } = makeDeps();
    const create = createCreateAlert(deps);
    const command = {
      userId: USER,
      symbol: 'btc',
      direction: 'above' as const,
      target: '100000',
      knownSymbols: KNOWN,
    };

    expect((await create(command)).ok).toBe(true);
    const second = await create(command);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe('duplicate');
  });

  it('refuses a target that is not a positive number', async () => {
    const { deps } = makeDeps();
    const create = createCreateAlert(deps);

    for (const target of ['0', '-1', 'abc', '']) {
      const result = await create({
        userId: USER,
        symbol: 'BTC',
        direction: 'above',
        target,
        knownSymbols: KNOWN,
      });
      expect(result.ok, `target ${JSON.stringify(target)}`).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('target-invalid');
    }
  });
});
