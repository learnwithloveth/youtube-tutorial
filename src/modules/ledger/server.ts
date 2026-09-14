import 'server-only';

/**
 * Server-side entry point for the ledger module.
 *
 * A barrel is imported *whole*, so exporting `registerLedger` from `index.ts` would
 * drag the database client into any Client Component that wanted a `WithdrawalDto`
 * — and the build would fail, correctly.
 *
 *   `@/modules/ledger`        types, DTOs, limit policy — safe anywhere
 *   `@/modules/ledger/server` composition, which touches infrastructure
 */

export type { LedgerModule, RegisterLedgerOptions } from './module';
export { registerLedger } from './module';

export type { PriceOracle } from './application/ports';

export { getWallet } from './application/queries/wallet';
export { listPendingApprovals } from './application/queries/pending-approvals';
export { getStatement } from './application/queries/statement';
export { listTransactions } from './application/queries/transactions';
export { getOperationsSummary } from './application/queries/operations-summary';
export { getTreasury } from './application/queries/treasury';
export { getReceipt } from './application/queries/receipt';

export type { RequestWithdrawalCommand } from './application/use-cases/request-withdrawal';
export type { DecideWithdrawalCommand } from './application/use-cases/decide-withdrawal';
export type { RecordDepositCommand } from './application/use-cases/record-deposit';
export type { SubmitDepositClaimCommand } from './application/use-cases/submit-deposit-claim';
export type { DecideDepositClaimCommand } from './application/use-cases/decide-deposit-claim';
export type { SendReceiptCommand } from './application/use-cases/send-receipt';
export type { CustomerDirectory, ReceiptSender } from './application/ports';

export { LEDGER_ASSETS } from './infrastructure/catalogue/assets';
