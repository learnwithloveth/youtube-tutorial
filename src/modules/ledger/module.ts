import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';
import { systemIdGenerator, type IdGenerator } from '@/shared/kernel/ids';

import type { LedgerDependencies, PriceOracle } from './application/ports';
import {
  createDecideWithdrawal,
  type DecideWithdrawal,
} from './application/use-cases/decide-withdrawal';
import {
  createRecordDeposit,
  type RecordDeposit,
} from './application/use-cases/record-deposit';
import {
  createRequestWithdrawal,
  type RequestWithdrawal,
} from './application/use-cases/request-withdrawal';
import { CatalogueAssetRegistry } from './infrastructure/catalogue/assets';
import {
  DrizzleLedgerRepository,
  DrizzleWithdrawalRepository,
} from './infrastructure/persistence/repositories';

/**
 * Ledger module registration.
 *
 * ── The price oracle is injected, not imported ─────────────────────────────────
 * The ledger needs USD values to enforce a daily limit, and market-data is where
 * prices live. Importing it here would couple the two contexts permanently and put
 * the price feed's availability inside the ledger's own dependency graph.
 *
 * Instead the ledger declares a `PriceOracle` port and the caller supplies it. The
 * only place that knows both modules exist is `src/server/ledger.ts`, which is the
 * layer whose job that is. The ledger's own tests pass a fake and never touch a
 * feed.
 */

export interface LedgerModule {
  readonly requestWithdrawal: RequestWithdrawal;
  readonly decideWithdrawal: DecideWithdrawal;
  readonly recordDeposit: RecordDeposit;
  /** Passed to the module's queries, which are free functions over these ports. */
  readonly dependencies: LedgerDependencies;
}

export interface RegisterLedgerOptions {
  db: Database;
  /** Supplied by the composition root; the ledger never reaches for a feed itself. */
  prices: PriceOracle;
  ids?: IdGenerator;
  clock?: Clock;
}

export function registerLedger(options: RegisterLedgerOptions): LedgerModule {
  const dependencies: LedgerDependencies = {
    accounts: new DrizzleLedgerRepository(options.db),
    withdrawals: new DrizzleWithdrawalRepository(options.db),
    prices: options.prices,
    assets: new CatalogueAssetRegistry(),
    ids: options.ids ?? systemIdGenerator,
    clock: options.clock ?? systemClock,
  };

  return {
    requestWithdrawal: createRequestWithdrawal(dependencies),
    decideWithdrawal: createDecideWithdrawal(dependencies),
    recordDeposit: createRecordDeposit(dependencies),
    dependencies,
  };
}
