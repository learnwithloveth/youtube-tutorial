import 'server-only';

import { and, asc, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';

import type { PgColumn } from 'drizzle-orm/pg-core';

import type { Database, Transaction } from '@/platform/db/client';
import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import {
  accountIdFor,
  LedgerAccount,
  platformOwner,
  userOwner,
  type AccountId,
  type AccountOwner,
  type PlatformPurpose,
} from '../../domain/account';
import type { LedgerAsset } from '../../domain/asset';
import { Transfer } from '../../domain/transfer';
import { Withdrawal, type WithdrawalStatus } from '../../domain/withdrawal';
import { DepositClaim, type DepositClaimStatus } from '../../domain/deposit-claim';
import type { ProofContentType } from '../../domain/proof-image';
import type {
  DecisionTally,
  DepositClaimRepository,
  FeedPageQuery,
  LedgerRepository,
  ProofStorage,
  StatementEntry,
  WithdrawalRepository,
} from '../../application/ports';
import {
  accounts,
  depositClaims,
  depositProofs,
  entries,
  transfers,
  withdrawalApprovals,
  withdrawals,
  type AccountRow,
  type DepositClaimRow,
  type WithdrawalRow,
} from './schema';

/** Raised when another writer changed a row first. */
export class ConcurrencyError extends Error {
  readonly _tag = 'ConcurrencyError';
  constructor(what: string, id: string) {
    super(`${what} ${id} was modified concurrently`);
    this.name = 'ConcurrencyError';
  }
}

export class DrizzleLedgerRepository implements LedgerRepository {
  constructor(private readonly db: Database) {}

  async findOrOpen(owner: AccountOwner, asset: LedgerAsset): Promise<LedgerAccount> {
    const id = accountIdFor(owner, asset.code);

    // Insert-then-read rather than read-then-insert: two first deposits for the
    // same customer racing would both find nothing and both insert, and only the
    // unique index can make exactly one of them win.
    await this.db
      .insert(accounts)
      .values({
        id,
        ownerKind: owner.kind,
        ownerId: owner.kind === 'user' ? owner.userId : owner.purpose,
        asset: asset.code,
        scale: asset.scale,
        balance: '0',
        held: '0',
      })
      .onConflictDoNothing({ target: accounts.id });

    const found = await this.find(id);
    if (found === null) {
      throw new Error(`Account ${id} could not be opened.`);
    }
    return found;
  }

  async find(id: AccountId): Promise<LedgerAccount | null> {
    const rows = await this.db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toAccount(row);
  }

  async listForOwner(owner: AccountOwner): Promise<LedgerAccount[]> {
    const ownerId = owner.kind === 'user' ? owner.userId : owner.purpose;

    const rows = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.ownerKind, owner.kind), eq(accounts.ownerId, ownerId)))
      .orderBy(asc(accounts.asset));

    return rows.map(toAccount);
  }

  /**
   * Writes a transfer, its entries and the resulting balances — atomically.
   *
   * ── The `version` guard is the whole point ─────────────────────────────────
   * Each balance update is conditional on the version the caller read. Two
   * withdrawals that both read version 7 produce two updates at version 7, and the
   * second matches zero rows — which becomes a `ConcurrencyError` rather than an
   * account paid out twice.
   *
   * ── The guard is checked inside the transaction ─────────────────────────────
   * An update that matches zero rows is not a database error, so nothing rolls back
   * on its own. The `ConcurrencyError` is thrown from inside `db.transaction()`, and
   * that is what takes the transfer, its entries and every other balance back out
   * with it. The `db.batch()` this replaced could only inspect results after
   * commit, so two deposits racing on the shared custody account would have left
   * the loser's transfer recorded and custody's balance unmoved — a ledger that no
   * longer sums to zero.
   *
   * The guard stays optimistic rather than `SELECT … FOR UPDATE`. The new balances
   * were computed from versions the caller read before calling this, so the
   * question is whether those reads are still current — which a conditional write
   * answers without holding a lock while the caller does its work.
   */
  async post(transfer: Transfer, updated: readonly LedgerAccount[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(transfers).values({
        id: transfer.id,
        kind: transfer.kind,
        reference: transfer.reference,
        network: transfer.network,
        txHash: transfer.txHash,
        occurredAt: transfer.occurredAt,
      });

      await tx.insert(entries).values(
        transfer.entries.map((entry, position) => ({
          // Derived from the transfer so a retry of the same transfer cannot write
          // its entries twice — the primary key refuses the duplicate.
          id: `${transfer.id}:${position}`,
          transferId: transfer.id,
          accountId: entry.accountId,
          asset: entry.delta.currency,
          delta: entry.delta.toDecimalString(),
          occurredAt: transfer.occurredAt,
        })),
      );

      // Zero rows means the version had moved on. Detected by the write itself
      // rather than by reading first, because "read the version, then write" is
      // exactly the race the version exists to close.
      for (const account of updated) {
        const rows = await this.updateBalance(tx, account);
        if (rows.length === 0) throw new ConcurrencyError('Account', account.id);
      }
    });
  }

  async saveAccounts(updated: readonly LedgerAccount[]): Promise<void> {
    for (const account of updated) {
      const rows = await this.updateBalance(this.db, account);
      if (rows.length === 0) throw new ConcurrencyError('Account', account.id);
    }
  }

  async listEntries(query: {
    owner: AccountOwner;
    asset?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<StatementEntry[]> {
    const rows = await this.db
      .select({
        id: entries.id,
        transferId: entries.transferId,
        accountId: entries.accountId,
        asset: entries.asset,
        delta: entries.delta,
        occurredAt: entries.occurredAt,
        scale: accounts.scale,
        kind: transfers.kind,
        reference: transfers.reference,
        network: transfers.network,
        txHash: transfers.txHash,
      })
      .from(entries)
      // Joined rather than fetched per row: a statement of fifty lines would
      // otherwise be a hundred extra round trips to answer "why did this change".
      .innerJoin(accounts, eq(entries.accountId, accounts.id))
      .innerJoin(transfers, eq(entries.transferId, transfers.id))
      .where(this.ownerScope(query.owner, query.asset))
      .orderBy(desc(entries.occurredAt), desc(entries.id))
      .limit(query.limit)
      .offset(query.offset);

    return rows.map((row) => ({
      id: row.id,
      transferId: row.transferId,
      kind: row.kind,
      reference: row.reference,
      network: row.network,
      txHash: row.txHash,
      accountId: row.accountId,
      delta: Money.fromDecimalString(row.delta, row.asset, row.scale),
      occurredAt: row.occurredAt,
    }));
  }

  async countEntries(owner: AccountOwner, asset?: string | undefined): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(entries)
      .innerJoin(accounts, eq(entries.accountId, accounts.id))
      .where(this.ownerScope(owner, asset));

    return rows[0]?.total ?? 0;
  }

  /** Restricts a statement read to one owner, and optionally one asset. */
  private ownerScope(owner: AccountOwner, asset?: string | undefined) {
    const ownerId = owner.kind === 'user' ? owner.userId : owner.purpose;
    const clauses = [eq(accounts.ownerKind, owner.kind), eq(accounts.ownerId, ownerId)];
    if (asset) clauses.push(eq(entries.asset, asset.toUpperCase()));
    return and(...clauses);
  }

  private updateBalance(executor: Database | Transaction, account: LedgerAccount) {
    const snapshot = account.snapshot();
    return executor
      .update(accounts)
      .set({
        balance: snapshot.balance.toDecimalString(),
        held: snapshot.held.toDecimalString(),
        version: snapshot.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, snapshot.id), eq(accounts.version, snapshot.version)))
      .returning({ id: accounts.id });
  }
}

/**
 * The `WHERE` for one page of a time-ordered feed.
 *
 * The cursor clause is a **row-value comparison** — `(occurred_at, id) < (?, ?)`,
 * not `occurred_at < ? OR (occurred_at = ? AND id < ?)`. They mean the same thing
 * and only the first is one index-ordered predicate the planner can seek on; the
 * expanded `OR` form typically degrades into a scan.
 */
function feedScope(
  occurredAt: PgColumn,
  id: PgColumn,
  query: FeedPageQuery,
  statusColumn: PgColumn,
  userColumn: PgColumn,
) {
  const clauses = [];
  if (query.before !== undefined) {
    clauses.push(
      sql`(${occurredAt}, ${id}) < (${query.before.occurredAt.toISOString()}::timestamptz, ${query.before.id})`,
    );
  }
  if (query.status !== undefined) clauses.push(eq(statusColumn, query.status));
  if (query.userId !== undefined) clauses.push(eq(userColumn, query.userId));
  return clauses.length === 0 ? undefined : and(...clauses);
}

/**
 * Decisions per UTC day, from a table that records when it was decided.
 *
 * Shared by both queues because the shape is identical and the risk of writing it
 * twice is that one of them buckets by the server's timezone. `at time zone 'UTC'`
 * has to come *before* the truncation: `decided_at` is a `timestamptz`, so
 * grouping it directly buckets by wherever the database happens to run, and a
 * region change would silently move every boundary.
 */
async function tallyDecisions(
  db: Database,
  table: typeof withdrawals | typeof depositClaims,
  since: Date,
): Promise<DecisionTally[]> {
  const day = sql<string>`to_char(${table.decidedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

  const rows = await db
    .select({ day, status: table.status, total: count() })
    .from(table)
    .where(and(isNotNull(table.decidedAt), gte(table.decidedAt, since)))
    .groupBy(day, table.status)
    .orderBy(day);

  const byDay = new Map<string, { day: string; approved: number; rejected: number }>();
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { day: row.day, approved: 0, rejected: 0 };
    // `pending` cannot appear — the `decided_at is not null` filter excludes it —
    // but the column's type says it can, so the switch stays exhaustive.
    if (row.status === 'approved') entry.approved += row.total;
    else if (row.status === 'rejected') entry.rejected += row.total;
    byDay.set(row.day, entry);
  }

  return [...byDay.values()];
}

function toAccount(row: AccountRow): LedgerAccount {
  const owner: AccountOwner =
    row.ownerKind === 'user'
      ? userOwner(row.ownerId as UserId)
      : platformOwner(row.ownerId as PlatformPurpose);

  return LedgerAccount.rehydrate({
    id: row.id,
    owner,
    asset: row.asset,
    // `numeric` arrives as a string, which is the whole reason the column is
    // `numeric` — the value reaches `Money` without passing through a float.
    balance: Money.fromDecimalString(row.balance, row.asset, row.scale),
    held: Money.fromDecimalString(row.held, row.asset, row.scale),
    version: row.version,
  });
}

export class DrizzleWithdrawalRepository implements WithdrawalRepository {
  constructor(private readonly db: Database) {}

  async save(withdrawal: Withdrawal): Promise<void> {
    const snapshot = withdrawal.snapshot();

    await this.db
      .insert(withdrawals)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        asset: snapshot.asset,
        scale: snapshot.amount.scale,
        amount: snapshot.amount.toDecimalString(),
        fee: snapshot.fee.toDecimalString(),
        network: snapshot.network,
        destination: snapshot.destination,
        valuedAtUsd: snapshot.valuedAtUsd?.toDecimalString() ?? null,
        status: snapshot.status,
        requestedAt: snapshot.requestedAt,
        decidedAt: snapshot.decidedAt,
        decidedBy: snapshot.decidedBy,
        reason: snapshot.reason,
      })
      .onConflictDoUpdate({
        target: withdrawals.id,
        // Only the decision fields move. Amount, destination and the frozen
        // valuation are what the customer asked for and what the limit was checked
        // against; an update path that could change them would let an operator
        // approve something other than what was requested.
        set: {
          status: sql`excluded.status`,
          decidedAt: sql`excluded.decided_at`,
          decidedBy: sql`excluded.decided_by`,
          reason: sql`excluded.reason`,
          version: sql`${withdrawals.version} + 1`,
        },
      });

    if (snapshot.approvals.length > 0) {
      await this.db
        .insert(withdrawalApprovals)
        .values(
          snapshot.approvals.map((approval) => ({
            id: `${snapshot.id}:${approval.operatorId}`,
            withdrawalId: snapshot.id,
            operatorId: approval.operatorId,
            approvedAt: approval.at,
          })),
        )
        // Re-saving a withdrawal re-sends its existing signatures; the unique index
        // makes that a no-op rather than an error.
        .onConflictDoNothing();
    }
  }

  async find(id: string): Promise<Withdrawal | null> {
    const rows = await this.db.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1);
    const row = rows[0];
    if (row === undefined) return null;

    const approvals = await this.approvalsFor([id]);
    return toWithdrawal(row, approvals.get(id) ?? []);
  }

  async listForUser(userId: UserId, limit: number): Promise<Withdrawal[]> {
    const rows = await this.db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(desc(withdrawals.requestedAt))
      .limit(limit);

    return this.hydrate(rows);
  }

  async listPending(limit: number): Promise<Withdrawal[]> {
    const rows = await this.db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.status, 'pending'))
      // Oldest first: the queue is worked from the top, and what a customer notices
      // is how long they waited.
      .orderBy(asc(withdrawals.requestedAt))
      .limit(limit);

    return this.hydrate(rows);
  }

  async listPage(query: FeedPageQuery): Promise<Withdrawal[]> {
    const rows = await this.db
      .select()
      .from(withdrawals)
      .where(
        feedScope(
          withdrawals.requestedAt,
          withdrawals.id,
          query,
          withdrawals.status,
          withdrawals.userId,
        ),
      )
      .orderBy(desc(withdrawals.requestedAt), desc(withdrawals.id))
      .limit(query.limit);

    return this.hydrate(rows);
  }

  async usedSince(userId: UserId, since: Date): Promise<Money> {
    const rows = await this.db
      .select({ total: sql<string>`coalesce(sum(${withdrawals.valuedAtUsd}), 0)` })
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.userId, userId),
          gte(withdrawals.requestedAt, since),
          // Pending counts. A rejected one does not — it never left, so it should
          // not consume the customer's allowance for the day.
          inArray(withdrawals.status, ['pending', 'approved']),
        ),
      );

    return Money.fromDecimalString(rows[0]?.total ?? '0', 'USD', 2);
  }

  async countByStatus(): Promise<{ status: WithdrawalStatus; total: number }[]> {
    const rows = await this.db
      .select({ status: withdrawals.status, total: count() })
      .from(withdrawals)
      .groupBy(withdrawals.status);

    return rows.map((row) => ({ status: row.status, total: row.total }));
  }

  async tallyDecisionsByDay(since: Date): Promise<DecisionTally[]> {
    return tallyDecisions(this.db, withdrawals, since);
  }

  async listRecentlyDecided(limit: number): Promise<Withdrawal[]> {
    const rows = await this.db
      .select()
      .from(withdrawals)
      .where(isNotNull(withdrawals.decidedAt))
      .orderBy(desc(withdrawals.decidedAt), desc(withdrawals.id))
      .limit(limit);

    return this.hydrate(rows);
  }

  /** Loads signatures for a page of withdrawals in one query, not one per row. */
  private async hydrate(rows: WithdrawalRow[]): Promise<Withdrawal[]> {
    if (rows.length === 0) return [];

    const approvals = await this.approvalsFor(rows.map((row) => row.id));
    return rows.map((row) => toWithdrawal(row, approvals.get(row.id) ?? []));
  }

  private async approvalsFor(
    ids: readonly string[],
  ): Promise<Map<string, { operatorId: UserId; at: Date }[]>> {
    const rows = await this.db
      .select()
      .from(withdrawalApprovals)
      .where(inArray(withdrawalApprovals.withdrawalId, [...ids]))
      .orderBy(asc(withdrawalApprovals.approvedAt));

    const byWithdrawal = new Map<string, { operatorId: UserId; at: Date }[]>();
    for (const row of rows) {
      const list = byWithdrawal.get(row.withdrawalId) ?? [];
      list.push({ operatorId: row.operatorId as UserId, at: row.approvedAt });
      byWithdrawal.set(row.withdrawalId, list);
    }
    return byWithdrawal;
  }
}

function toWithdrawal(
  row: WithdrawalRow,
  approvals: { operatorId: UserId; at: Date }[],
): Withdrawal {
  return Withdrawal.rehydrate({
    id: row.id,
    userId: row.userId as UserId,
    asset: row.asset,
    amount: Money.fromDecimalString(row.amount, row.asset, row.scale),
    fee: Money.fromDecimalString(row.fee, row.asset, row.scale),
    network: row.network,
    destination: row.destination,
    valuedAtUsd:
      row.valuedAtUsd === null ? null : Money.fromDecimalString(row.valuedAtUsd, 'USD', 2),
    status: row.status,
    requestedAt: row.requestedAt,
    approvals,
    decidedAt: row.decidedAt,
    decidedBy: (row.decidedBy as UserId | null) ?? null,
    reason: row.reason,
  });
}

export { Transfer };

/**
 * Deposit claims, stored in Postgres.
 *
 * The proof is not joined here on purpose: a claim row is small and read in lists,
 * and dragging a two-megabyte image along for every row in the operator queue
 * would make the queue unusable. Proofs are fetched one at a time, by the route
 * that actually displays one.
 */
export class DrizzleDepositClaimRepository implements DepositClaimRepository {
  constructor(private readonly db: Database) {}

  async save(claim: DepositClaim): Promise<void> {
    const snapshot = claim.snapshot();

    await this.db
      .insert(depositClaims)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        asset: snapshot.asset,
        network: snapshot.network,
        scale: snapshot.claimedAmount.scale,
        claimedAmount: snapshot.claimedAmount.toDecimalString(),
        creditedAmount: snapshot.creditedAmount?.toDecimalString() ?? null,
        reference: snapshot.reference,
        proofId: snapshot.proofId,
        status: snapshot.status,
        submittedAt: snapshot.submittedAt,
        confirmingAt: snapshot.confirmingAt,
        confirmingBy: snapshot.confirmingBy,
        confirmingNote: snapshot.confirmingNote,
        decidedAt: snapshot.decidedAt,
        decidedBy: snapshot.decidedBy,
        reason: snapshot.reason,
        transferId: snapshot.transferId,
      })
      .onConflictDoUpdate({
        target: depositClaims.id,
        // Only the decision fields move. The claimed amount, the reference and the
        // proof are what the customer submitted; an update path that could rewrite
        // them would let an operator approve something other than what was claimed.
        set: {
          creditedAmount: sql`excluded.credited_amount`,
          status: sql`excluded.status`,
          // The confirming trio moves for the same reason the decided one does: an
          // operator marking a claim as waiting on the chain is a state change on
          // this row, and it is the only thing that writes these three.
          confirmingAt: sql`excluded.confirming_at`,
          confirmingBy: sql`excluded.confirming_by`,
          confirmingNote: sql`excluded.confirming_note`,
          decidedAt: sql`excluded.decided_at`,
          decidedBy: sql`excluded.decided_by`,
          reason: sql`excluded.reason`,
          transferId: sql`excluded.transfer_id`,
          version: sql`${depositClaims.version} + 1`,
        },
      });
  }

  async find(id: string): Promise<DepositClaim | null> {
    const rows = await this.db
      .select()
      .from(depositClaims)
      .where(eq(depositClaims.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toClaim(row);
  }

  async listForUser(userId: UserId, limit: number): Promise<DepositClaim[]> {
    const rows = await this.db
      .select()
      .from(depositClaims)
      .where(eq(depositClaims.userId, userId))
      .orderBy(desc(depositClaims.submittedAt))
      .limit(limit);

    return rows.map(toClaim);
  }

  async listPending(limit: number): Promise<DepositClaim[]> {
    const rows = await this.db
      .select()
      .from(depositClaims)
      // Confirming claims stay in the queue. They are undecided — an operator has
      // seen the evidence and is waiting on the chain, not finished with it — and
      // a queue that dropped them would be a list of work an operator can lose
      // track of by marking something as in progress.
      .where(inArray(depositClaims.status, ['pending', 'confirming']))
      // Oldest first: a customer waiting on funds notices the wait, not the size.
      .orderBy(asc(depositClaims.submittedAt))
      .limit(limit);

    return rows.map(toClaim);
  }

  async listPage(query: FeedPageQuery): Promise<DepositClaim[]> {
    const rows = await this.db
      .select()
      .from(depositClaims)
      .where(
        feedScope(
          depositClaims.submittedAt,
          depositClaims.id,
          query,
          depositClaims.status,
          depositClaims.userId,
        ),
      )
      .orderBy(desc(depositClaims.submittedAt), desc(depositClaims.id))
      .limit(query.limit);

    return rows.map(toClaim);
  }

  async countByStatus(): Promise<{ status: DepositClaimStatus; total: number }[]> {
    const rows = await this.db
      .select({ status: depositClaims.status, total: count() })
      .from(depositClaims)
      .groupBy(depositClaims.status);

    return rows.map((row) => ({ status: row.status, total: row.total }));
  }

  async tallyDecisionsByDay(since: Date): Promise<DecisionTally[]> {
    return tallyDecisions(this.db, depositClaims, since);
  }

  async listRecentlyDecided(limit: number): Promise<DepositClaim[]> {
    const rows = await this.db
      .select()
      .from(depositClaims)
      .where(isNotNull(depositClaims.decidedAt))
      .orderBy(desc(depositClaims.decidedAt), desc(depositClaims.id))
      .limit(limit);

    return rows.map(toClaim);
  }
}

function toClaim(row: DepositClaimRow): DepositClaim {
  return DepositClaim.rehydrate({
    id: row.id,
    userId: row.userId as UserId,
    asset: row.asset,
    network: row.network,
    claimedAmount: Money.fromDecimalString(row.claimedAmount, row.asset, row.scale),
    creditedAmount:
      row.creditedAmount === null
        ? null
        : Money.fromDecimalString(row.creditedAmount, row.asset, row.scale),
    reference: row.reference,
    proofId: row.proofId,
    status: row.status,
    submittedAt: row.submittedAt,
    confirmingAt: row.confirmingAt,
    confirmingBy: (row.confirmingBy as UserId | null) ?? null,
    confirmingNote: row.confirmingNote,
    decidedAt: row.decidedAt,
    decidedBy: (row.decidedBy as UserId | null) ?? null,
    reason: row.reason,
    transferId: row.transferId,
  });
}

/**
 * Proof images, as bytes in Postgres.
 *
 * ── The adapter this design expects to replace ─────────────────────────────────
 * It needs no credentials and lands in the same database as the claim, so a proof
 * and the claim that references it cannot diverge. That is genuinely worth having
 * while the volume is small.
 *
 * It is also the wrong home past a few hundred proofs: this project's database
 * tier is 512 MB in total, a `bytea` column inflates every backup and every
 * branch, and the bytes travel through the application on every read rather than
 * going browser-to-storage. When that starts to bite, `ProofStorage` gets an
 * object-storage adapter and nothing above this line changes — which is the whole
 * reason the port exists.
 */
export class PostgresProofStorage implements ProofStorage {
  constructor(private readonly db: Database) {}

  async put(bytes: Uint8Array, contentType: ProofContentType): Promise<string> {
    // A random key, never anything derived from the upload. A customer-supplied
    // filename in a storage key is a path-traversal waiting for the adapter that
    // writes to a filesystem.
    const id = crypto.randomUUID();

    await this.db.insert(depositProofs).values({
      id,
      contentType,
      bytes,
      byteLength: bytes.byteLength,
    });

    return id;
  }

  async get(
    proofId: string,
  ): Promise<{ bytes: Uint8Array; contentType: ProofContentType } | null> {
    const rows = await this.db
      .select()
      .from(depositProofs)
      .where(eq(depositProofs.id, proofId))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    return { bytes: row.bytes, contentType: row.contentType };
  }

  async remove(proofId: string): Promise<void> {
    await this.db.delete(depositProofs).where(eq(depositProofs.id, proofId));
  }
}
