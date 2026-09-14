import 'server-only';

import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import type { Database } from '@/platform/db/client';
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
import type {
  LedgerRepository,
  StatementEntry,
  WithdrawalRepository,
} from '../../application/ports';
import {
  accounts,
  entries,
  transfers,
  withdrawalApprovals,
  withdrawals,
  type AccountRow,
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
   * ── On the Neon HTTP driver ────────────────────────────────────────────────
   * `db.batch()` here maps to the driver's `transaction()`, which submits every
   * statement in one request and runs it as a real Postgres transaction — so this
   * is atomic, and a failure rolls the whole thing back.
   *
   * What it is *not* is interactive: the statements are decided before any result
   * comes back, so there is no `SELECT … FOR UPDATE`, read the row, then branch.
   * That is exactly why concurrency is handled with optimistic versions instead.
   * The two choices are connected — a pessimistic lock is unavailable over this
   * transport, so the guard has to be a conditional write whose failure the caller
   * detects afterwards.
   */
  async post(transfer: Transfer, updated: readonly LedgerAccount[]): Promise<void> {
    const balanceWrites = updated.map((account) => this.updateBalance(account));

    // Drizzle types a batch as a non-empty tuple, which a spread cannot satisfy.
    // The shape is correct by construction — two inserts followed by one update per
    // account — so the assertion is about expressing that, not about evading it.
    const writes = [
      this.db.insert(transfers).values({
        id: transfer.id,
        kind: transfer.kind,
        reference: transfer.reference,
        occurredAt: transfer.occurredAt,
      }),

      this.db.insert(entries).values(
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
      ),

      ...balanceWrites,
    ] as unknown as Parameters<Database['batch']>[0];

    const results = await this.db.batch(writes);

    // Every balance update returns the rows it touched; zero means the version had
    // moved on. Checked after the batch rather than before, because "read the
    // version, then write" is exactly the race the version exists to close.
    const balanceResults = results.slice(2) as { id: string }[][];
    balanceResults.forEach((rows, index) => {
      if (rows.length === 0) {
        const account = updated[index];
        throw new ConcurrencyError('Account', account?.id ?? 'unknown');
      }
    });
  }

  async saveAccounts(updated: readonly LedgerAccount[]): Promise<void> {
    for (const account of updated) {
      const rows = await this.updateBalance(account);
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

  private updateBalance(account: LedgerAccount) {
    const snapshot = account.snapshot();
    return this.db
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
