import 'server-only';

import type { TransactionFeedOptions, TransactionPageDto } from '@/modules/ledger';
import { listTransactions } from '@/modules/ledger/server';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { identity } from './auth';
import { ledger } from './ledger';

/**
 * The console's transaction feed: ledger records, with the people behind them.
 *
 * ── The join lives here because neither module may do it ───────────────────────
 * The ledger holds an opaque `UserId` and has never heard of an email address;
 * identity holds the address and has never heard of a balance. That they know
 * nothing of each other is what lets either be lifted out, and it is enforced down
 * to the database — no foreign key crosses between `ledger` and `identity`.
 *
 * So the two reads happen side by side in this file, which is the layer whose job
 * composition is, at the cost of a second query. The same arrangement `users.ts`
 * uses for identity, presence and activity.
 *
 * ── Accounts come back as a lookup, not folded into each row ───────────────────
 * A page of twenty transactions is often five customers. Inlining the email on
 * every row would repeat it, and — the part that actually matters — it would make
 * the transaction DTO a thing that knows about identity, which is the coupling the
 * boundary exists to prevent. The console merges the two by id at render time.
 */

export interface TransactionAccountDto {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly role: string;
}

export interface TransactionFeedDto extends TransactionPageDto {
  /** Keyed by `UserId`. Missing for a record whose account could not be read. */
  readonly accounts: Readonly<Record<string, TransactionAccountDto>>;
}

const UNAVAILABLE: TransactionFeedDto = {
  transactions: [],
  nextCursor: null,
  degraded: true,
  accounts: {},
};

export async function getTransactionFeed(
  options: TransactionFeedOptions = {},
): Promise<TransactionFeedDto> {
  const context = ledger();
  if (context === null) return UNAVAILABLE;

  const page = await listTransactions(context.dependencies, options);
  if (page.degraded || page.transactions.length === 0) {
    return { ...page, accounts: {} };
  }

  return { ...page, accounts: await describeAccounts(page.transactions.map((t) => t.userId)) };
}

/**
 * Who the ids belong to.
 *
 * Never throws and never fails the page. A transaction whose owner cannot be
 * looked up still has to render — an operator needs to see that money moved even
 * when the directory is the thing that is down, and the id is on the row either
 * way. Falling back to an empty map means the console shows the raw id, which is
 * the truth minus a convenience.
 */
async function describeAccounts(
  ids: readonly string[],
): Promise<Record<string, TransactionAccountDto>> {
  const unique = [...new Set(ids)].flatMap((id) => {
    try {
      return [toUserId(id)];
    } catch {
      // A stored id that is not a well-formed `UserId` is a data fault, not a
      // reason to fail the read. It is logged where it is written, not here.
      return [];
    }
  }) as UserId[];

  if (unique.length === 0) return {};

  try {
    const found = await identity().describeUsers(unique);
    return Object.fromEntries(
      [...found.values()].map((user) => [
        user.id,
        { id: user.id, email: user.email, status: user.status, role: user.role },
      ]),
    );
  } catch (error) {
    logger.warn({ event: 'transaction_accounts_read_failed', module: 'identity' }, error);
    return {};
  }
}
