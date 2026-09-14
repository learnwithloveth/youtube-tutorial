import 'server-only';

import { inArray, sql } from 'drizzle-orm';

import type { Database } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';

import type { RiskRule } from '../../domain/risk-signal';
import type {
  RawRiskSignal,
  RiskDispositionRecord,
  RiskDispositionStore,
  RiskScanner,
} from '../../application/ports';
import { riskDispositions } from './schema';

/**
 * The risk rules, evaluated in the database.
 *
 * ── Why these are raw SQL and not Drizzle's query builder ─────────────────────
 * Every one is an aggregate with a `having`, or a self-join on a time window. The
 * builder can express them, at the cost of making the rule unreadable to the person
 * who has to decide whether it is the right rule — and that person is the reason
 * this feature exists. Written out, each query is checkable against the sentence in
 * `domain/risk-signal.ts` that describes it.
 *
 * ── Every query runs against `ledger.*` only ──────────────────────────────────
 * No joins to `identity.users`, not even for an email. A module's tables are its
 * own, and the console turns the ids into people afterwards through the directory,
 * which is the same seam every other cross-context read in this codebase uses.
 *
 * ── Timestamps come back as strings ──────────────────────────────────────────
 * `db.execute` with raw SQL bypasses the driver's column mapping, so a
 * `timestamptz` arrives as text where the query builder would have given a `Date`.
 * The conversion happens here, at the boundary, and the row types say `string` so
 * the next person does not have to find that out from a crash.
 *
 * ── One scan runs them all, in parallel, and tolerates one failing ────────────
 * `Promise.allSettled`, not `Promise.all`: a rule that errors takes its own results
 * away and leaves the other four on the screen. On a compliance board, four rules
 * and a logged failure beats an empty page.
 */
export class SqlRiskScanner implements RiskScanner {
  constructor(private readonly db: Database) {}

  async scan(options: {
    now: Date;
    velocityThreshold: number;
    velocityWindowHours: number;
    retryWindowHours: number;
    refusalThreshold: number;
    limitPerRule: number;
  }): Promise<RawRiskSignal[]> {
    const limit = options.limitPerRule;

    const named: readonly [RiskRule, Promise<RawRiskSignal[]>][] = [
      ['shared-destination', this.sharedDestinations(limit)],
      ['retry-after-refusal', this.retriesAfterRefusal(options.retryWindowHours, limit)],
      ['credit-mismatch', this.creditMismatches(limit)],
      ['withdrawal-velocity', this.velocity(options.velocityThreshold, options.velocityWindowHours, limit)],
      ['repeated-refusals', this.repeatedRefusals(options.refusalThreshold, limit)],
    ];

    const results = await Promise.allSettled(named.map(([, query]) => query));

    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value;

      // Logged, never swallowed. A rule that silently returns nothing is
      // indistinguishable from a rule that found nothing, and on a compliance
      // board those are opposite conclusions — this exact failure mode hid a
      // broken query during development until a probe went looking for it.
      logger.error(
        { event: 'risk_rule_failed', module: 'ledger', rule: named[index]?.[0] },
        result.reason,
      );
      return [];
    });
  }

  /** One destination address paid to by more than one account. */
  private async sharedDestinations(limit: number): Promise<RawRiskSignal[]> {
    const result = await this.db.execute<{
      destination: string;
      accounts: string[];
      requests: number;
      latest: string;
    }>(sql`
      select
        destination,
        array_agg(distinct user_id order by user_id) as accounts,
        count(*)::int as requests,
        max(requested_at) as latest
      from ledger.withdrawals
      group by destination
      having count(distinct user_id) > 1
      order by max(requested_at) desc
      limit ${limit}::int
    `);

    return result.rows.map((row) =>
      signal('shared-destination', row.accounts, new Date(row.latest), [
        { label: 'Destination', value: row.destination },
        { label: 'Accounts', value: String(row.accounts.length) },
        { label: 'Requests to it', value: String(row.requests) },
      ]),
    );
  }

  /** A fresh request inside the window after one was rejected. */
  private async retriesAfterRefusal(windowHours: number, limit: number): Promise<RawRiskSignal[]> {
    const result = await this.db.execute<{
      retry_id: string;
      refused_id: string;
      user_id: string;
      requested_at: string;
      reason: string | null;
    }>(sql`
      select
        retry.id as retry_id,
        refused.id as refused_id,
        retry.user_id,
        retry.requested_at,
        refused.reason
      from ledger.withdrawals retry
      join ledger.withdrawals refused
        on refused.user_id = retry.user_id
       and refused.status = 'rejected'
       and refused.decided_at is not null
       and retry.requested_at > refused.decided_at
       and retry.requested_at <= refused.decided_at + make_interval(hours => ${windowHours}::int)
      order by retry.requested_at desc
      limit ${limit}::int
    `);

    return result.rows.map((row) =>
      signal(
        'retry-after-refusal',
        [row.user_id],
        new Date(row.requested_at),
        [
          { label: 'New request', value: row.retry_id },
          { label: 'Refused request', value: row.refused_id },
          { label: 'Reason given', value: row.reason ?? '—' },
        ],
        `${row.refused_id}:${row.retry_id}`,
      ),
    );
  }

  /** An approved claim credited at a different figure than the customer reported. */
  private async creditMismatches(limit: number): Promise<RawRiskSignal[]> {
    const result = await this.db.execute<{
      id: string;
      user_id: string;
      asset: string;
      claimed: string;
      credited: string;
      decided_at: string;
    }>(sql`
      select
        id,
        user_id,
        asset,
        claimed_amount::text as claimed,
        credited_amount::text as credited,
        decided_at
      from ledger.deposit_claims
      where status = 'approved'
        and credited_amount is not null
        and credited_amount <> claimed_amount
        and decided_at is not null
      order by decided_at desc
      limit ${limit}::int
    `);

    return result.rows.map((row) =>
      signal(
        'credit-mismatch',
        [row.user_id],
        new Date(row.decided_at),
        [
          { label: 'Claim', value: row.id },
          { label: 'Reported', value: `${trim(row.claimed)} ${row.asset}` },
          { label: 'Credited', value: `${trim(row.credited)} ${row.asset}` },
        ],
        row.id,
      ),
    );
  }

  /** Several withdrawal requests from one account inside the window. */
  private async velocity(
    threshold: number,
    windowHours: number,
    limit: number,
  ): Promise<RawRiskSignal[]> {
    const result = await this.db.execute<{
      user_id: string;
      requests: number;
      latest: string;
      earliest: string;
    }>(sql`
      select
        user_id,
        count(*)::int as requests,
        max(requested_at) as latest,
        min(requested_at) as earliest
      from ledger.withdrawals
      where requested_at > now() - make_interval(hours => ${windowHours}::int)
      group by user_id
      having count(*) >= ${threshold}::int
      order by count(*) desc
      limit ${limit}::int
    `);

    return result.rows.map((row) =>
      signal(
        'withdrawal-velocity',
        [row.user_id],
        new Date(row.latest),
        [
          { label: 'Requests', value: String(row.requests) },
          { label: 'Window', value: `${windowHours}h` },
          { label: 'First', value: new Date(row.earliest).toISOString() },
        ],
        // The count is in the key on purpose: clearing "three requests" should not
        // silence the same account reaching six.
        String(row.requests),
      ),
    );
  }

  /** An account whose deposit claims keep being rejected. */
  private async repeatedRefusals(threshold: number, limit: number): Promise<RawRiskSignal[]> {
    const result = await this.db.execute<{
      user_id: string;
      refusals: number;
      latest: string;
    }>(sql`
      select
        user_id,
        count(*)::int as refusals,
        max(decided_at) as latest
      from ledger.deposit_claims
      where status = 'rejected' and decided_at is not null
      group by user_id
      having count(*) >= ${threshold}::int
      order by count(*) desc
      limit ${limit}::int
    `);

    return result.rows.map((row) =>
      signal(
        'repeated-refusals',
        [row.user_id],
        new Date(row.latest),
        [
          { label: 'Refused claims', value: String(row.refusals) },
          { label: 'Most recent', value: new Date(row.latest).toISOString() },
        ],
        String(row.refusals),
      ),
    );
  }
}

/**
 * Builds a finding with a key derived from what it rests on.
 *
 * The discriminator is the part of the evidence that should bring a cleared finding
 * back when it changes — a third account on an address, a fourth withdrawal in the
 * window. Leave it out and the key is the rule plus its subjects, which is right for
 * a finding that cannot get worse.
 */
function signal(
  rule: RiskRule,
  subjects: readonly string[],
  observedAt: Date,
  evidence: readonly { label: string; value: string }[],
  discriminator?: string,
): RawRiskSignal {
  const subjectPart = [...subjects].sort().join(',');
  return {
    rule,
    key: discriminator === undefined
      ? `${rule}:${subjectPart}`
      : `${rule}:${subjectPart}:${discriminator}`,
    subjects,
    evidence,
    observedAt,
  };
}

/** Postgres `numeric` comes back padded to its scale; the console reads the value. */
function trim(decimal: string): string {
  if (!decimal.includes('.')) return decimal;
  const trimmed = decimal.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

export class DrizzleRiskDispositionStore implements RiskDispositionStore {
  constructor(private readonly db: Database) {}

  async findMany(keys: readonly string[]): Promise<Map<string, RiskDispositionRecord>> {
    if (keys.length === 0) return new Map();

    // `inArray`, not a raw `any(${keys})`: drizzle's sql template expands a JS
    // array into one parameter per element, so `any()` receives a parameter list
    // rather than an array and the statement is a syntax error.
    const rows = await this.db
      .select()
      .from(riskDispositions)
      .where(inArray(riskDispositions.key, [...keys]));

    return new Map(
      rows.map((row) => [
        row.key,
        {
          key: row.key,
          disposition: row.disposition,
          decidedBy: row.decidedBy,
          decidedAt: row.decidedAt,
          note: row.note,
        },
      ]),
    );
  }

  async record(entry: RiskDispositionRecord): Promise<void> {
    await this.db
      .insert(riskDispositions)
      .values({
        key: entry.key,
        disposition: entry.disposition,
        decidedBy: entry.decidedBy,
        decidedAt: entry.decidedAt,
        note: entry.note,
      })
      // Last decision wins. Re-deciding a finding is ordinary — somebody clears it,
      // then a colleague looks again — and the row records the current position,
      // while the activity trail records that each decision happened.
      .onConflictDoUpdate({
        target: riskDispositions.key,
        set: {
          disposition: entry.disposition,
          decidedBy: entry.decidedBy,
          decidedAt: entry.decidedAt,
          note: entry.note,
        },
      });
  }
}
