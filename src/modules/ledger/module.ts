import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';
import { systemIdGenerator, type IdGenerator } from '@/shared/kernel/ids';

import type {
  CustomerDirectory,
  LedgerDependencies,
  PriceOracle,
  ReceiptSender,
} from './application/ports';
import {
  createDecideWithdrawal,
  type DecideWithdrawal,
} from './application/use-cases/decide-withdrawal';
import {
  createDecideDepositClaim,
  type DecideDepositClaim,
} from './application/use-cases/decide-deposit-claim';
import {
  createRecordDeposit,
  type RecordDeposit,
} from './application/use-cases/record-deposit';
import {
  createSubmitDepositClaim,
  type SubmitDepositClaim,
} from './application/use-cases/submit-deposit-claim';
import {
  createRequestWithdrawal,
  type RequestWithdrawal,
} from './application/use-cases/request-withdrawal';
import {
  createSendReceipt,
  createSendTransactionEmail,
  type SendReceipt,
  type SendTransactionEmail,
} from './application/use-cases/send-receipt';
import {
  createDecideRiskSignal,
  type DecideRiskSignal,
} from './application/use-cases/decide-risk-signal';
import { CatalogueAssetRegistry } from './infrastructure/catalogue/assets';
import {
  DrizzleRiskDispositionStore,
  SqlRiskScanner,
} from './infrastructure/persistence/risk';
import {
  DrizzleDepositClaimRepository,
  DrizzleLedgerRepository,
  DrizzleWithdrawalRepository,
  PostgresProofStorage,
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
  /** A customer submits evidence that funds arrived. Credits nothing. */
  readonly submitDepositClaim: SubmitDepositClaim;
  /** An operator confirms or refuses that evidence. This is what credits. */
  readonly decideDepositClaim: DecideDepositClaim;
  /** Emails a customer the record of a decided movement. The console's button. */
  readonly sendReceipt: SendReceipt;
  /**
   * Emails a customer where a deposit or withdrawal now stands — acknowledged while
   * pending, the receipt once decided. Sent at every step without anyone asking.
   */
  readonly sendTransactionEmail: SendTransactionEmail;
  /** An operator clears or escalates one risk finding. Records, never acts. */
  readonly decideRiskSignal: DecideRiskSignal;
  /** Passed to the module's queries, which are free functions over these ports. */
  readonly dependencies: LedgerDependencies;
}

export interface RegisterLedgerOptions {
  db: Database;
  /** Supplied by the composition root; the ledger never reaches for a feed itself. */
  prices: PriceOracle;
  /** Both optional: a deployment without mail still runs, and says so on the page. */
  receipts?: ReceiptSender | undefined;
  directory?: CustomerDirectory | undefined;
  /** The deployment's name, for the head of every email. */
  siteName: string;
  ids?: IdGenerator;
  clock?: Clock;
}

export function registerLedger(options: RegisterLedgerOptions): LedgerModule {
  const dependencies: LedgerDependencies = {
    accounts: new DrizzleLedgerRepository(options.db),
    withdrawals: new DrizzleWithdrawalRepository(options.db),
    claims: new DrizzleDepositClaimRepository(options.db),
    // Postgres for now; see `PostgresProofStorage` for when this becomes an
    // object-storage adapter and why the port exists.
    proofs: new PostgresProofStorage(options.db),
    prices: options.prices,
    receipts: options.receipts,
    directory: options.directory,
    siteName: options.siteName,
    assets: new CatalogueAssetRegistry(),
    risk: new SqlRiskScanner(options.db),
    dispositions: new DrizzleRiskDispositionStore(options.db),
    ids: options.ids ?? systemIdGenerator,
    clock: options.clock ?? systemClock,
  };

  return {
    requestWithdrawal: createRequestWithdrawal(dependencies),
    decideWithdrawal: createDecideWithdrawal(dependencies),
    recordDeposit: createRecordDeposit(dependencies),
    submitDepositClaim: createSubmitDepositClaim(dependencies),
    decideDepositClaim: createDecideDepositClaim(dependencies),
    sendReceipt: createSendReceipt(dependencies),
    sendTransactionEmail: createSendTransactionEmail(dependencies),
    decideRiskSignal: createDecideRiskSignal(dependencies),
    dependencies,
  };
}
