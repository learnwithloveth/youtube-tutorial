import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel/clock';
import type { UserId } from '@/shared/kernel/ids';

import { getRiskBoard } from '../queries/risk-signals';
import { createDecideRiskSignal } from '../use-cases/decide-risk-signal';
import type {
  LedgerDependencies,
  RawRiskSignal,
  RiskDispositionRecord,
  RiskDispositionStore,
  RiskScanner,
} from '../ports';

const NOW = new Date('2026-09-14T12:00:00Z');
const OPERATOR = 'op_1' as UserId;

function finding(overrides: Partial<RawRiskSignal> = {}): RawRiskSignal {
  return {
    rule: 'credit-mismatch',
    key: 'credit-mismatch:user_1:claim_1',
    subjects: ['user_1'],
    evidence: [{ label: 'Claim', value: 'claim_1' }],
    observedAt: NOW,
    ...overrides,
  };
}

class FakeScanner implements RiskScanner {
  constructor(private readonly findings: RawRiskSignal[]) {}
  async scan(): Promise<RawRiskSignal[]> {
    return this.findings;
  }
}

class FakeDispositions implements RiskDispositionStore {
  readonly store = new Map<string, RiskDispositionRecord>();

  async findMany(keys: readonly string[]): Promise<Map<string, RiskDispositionRecord>> {
    return new Map(
      keys.flatMap((key) => {
        const found = this.store.get(key);
        return found ? ([[key, found]] as [string, RiskDispositionRecord][]) : [];
      }),
    );
  }

  async record(entry: RiskDispositionRecord): Promise<void> {
    this.store.set(entry.key, entry);
  }
}

function makeDeps(findings: RawRiskSignal[]) {
  const dispositions = new FakeDispositions();
  const deps = {
    risk: new FakeScanner(findings),
    dispositions,
    clock: fixedClock(NOW),
  } as unknown as LedgerDependencies;
  return { deps, dispositions };
}

describe('the risk board', () => {
  it('orders worst first, then newest within a severity', () => {
    const { deps } = makeDeps([
      finding({ rule: 'repeated-refusals', key: 'low' }),
      finding({
        rule: 'shared-destination',
        key: 'high-old',
        observedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      finding({ rule: 'withdrawal-velocity', key: 'medium' }),
      finding({
        rule: 'retry-after-refusal',
        key: 'high-new',
        observedAt: new Date('2026-09-13T00:00:00Z'),
      }),
    ]);

    return getRiskBoard(deps).then((board) => {
      expect(board.open.map((signal) => signal.key)).toEqual([
        'high-new',
        'high-old',
        'medium',
        'low',
      ]);
    });
  });

  it('carries no confidence score of any kind', async () => {
    // The guard on the whole point of this feature. A deterministic rule either
    // matched or it did not, and the screen this replaced attached an invented
    // percentage to a named customer.
    const { deps } = makeDeps([finding()]);
    const board = await getRiskBoard(deps);

    expect(Object.keys(board.open[0] ?? {})).not.toContain('confidence');
  });

  it('separates decided findings from open ones', async () => {
    const { deps, dispositions } = makeDeps([finding({ key: 'a' }), finding({ key: 'b' })]);

    await dispositions.record({
      key: 'a',
      disposition: 'escalated',
      decidedBy: OPERATOR,
      decidedAt: NOW,
      note: 'Looks coordinated.',
    });

    const board = await getRiskBoard(deps);
    expect(board.open.map((signal) => signal.key)).toEqual(['b']);
    expect(board.handled.map((signal) => signal.key)).toEqual(['a']);
    expect(board.escalated).toBe(1);
    expect(board.handled[0]?.note).toBe('Looks coordinated.');
  });

  it('reports a failed scan as degraded rather than as a clean board', async () => {
    // These are opposite conclusions on a compliance screen, and the page renders
    // a different message for each.
    const deps = {
      risk: {
        scan: () => Promise.reject(new Error('connection reset')),
      },
      dispositions: new FakeDispositions(),
      clock: fixedClock(NOW),
    } as unknown as LedgerDependencies;

    const board = await getRiskBoard(deps);
    expect(board.degraded).toBe(true);
    expect(board.unavailable).toBe(false);
    expect(board.open).toEqual([]);
  });

  it('distinguishes "no scanner configured" from "nothing found"', async () => {
    const deps = { clock: fixedClock(NOW) } as unknown as LedgerDependencies;
    const board = await getRiskBoard(deps);

    expect(board.unavailable).toBe(true);
    expect(board.degraded).toBe(false);
  });
});

describe('triaging a finding', () => {
  it('refuses to escalate without a note', async () => {
    const { deps, dispositions } = makeDeps([finding()]);
    const result = await createDecideRiskSignal(deps)({
      key: 'credit-mismatch:user_1:claim_1',
      disposition: 'escalated',
      decidedBy: OPERATOR,
      note: '   ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('risk-note-required');
    // And nothing was written, rather than an escalation with an empty note.
    expect(dispositions.store.size).toBe(0);
  });

  it('allows clearing without one', async () => {
    // "Nothing here" is not worth typing; "why this one is not ordinary" is.
    const { deps, dispositions } = makeDeps([finding()]);
    const result = await createDecideRiskSignal(deps)({
      key: 'credit-mismatch:user_1:claim_1',
      disposition: 'cleared',
      decidedBy: OPERATOR,
    });

    expect(result.ok).toBe(true);
    expect(dispositions.store.get('credit-mismatch:user_1:claim_1')?.note).toBeNull();
  });

  it('records the operator and the moment', async () => {
    const { deps, dispositions } = makeDeps([finding()]);
    await createDecideRiskSignal(deps)({
      key: 'k',
      disposition: 'escalated',
      decidedBy: OPERATOR,
      note: 'Second account on the same address.',
    });

    const stored = dispositions.store.get('k');
    expect(stored?.decidedBy).toBe(OPERATOR);
    expect(stored?.decidedAt).toEqual(NOW);
  });

  it('refuses when no disposition store is wired', async () => {
    const deps = { clock: fixedClock(NOW) } as unknown as LedgerDependencies;
    const result = await createDecideRiskSignal(deps)({
      key: 'k',
      disposition: 'cleared',
      decidedBy: OPERATOR,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('risk-unavailable');
  });
});
