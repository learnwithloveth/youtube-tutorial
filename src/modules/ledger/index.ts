/**
 * ledger — public API, safe to import anywhere.
 *
 * Types, DTOs and the policy constants a form needs. Composition lives in
 * `./server`, which is `server-only`.
 *
 * No `Money` crosses this boundary and no domain object does. Every amount is an
 * exact decimal string, which is the money rule applied at the edge: a DTO with
 * `balance: number` would discard the precision the domain preserved, silently, at
 * the one layer where the mistake is invisible in review.
 */

export type {
  AssetOptionDto,
  BalanceDto,
  DailyLimitDto,
  WalletDto,
  WithdrawalDto,
} from './application/dto';
export { maskDestination } from './application/dto';

export type { LedgerError } from './domain/errors';
export { presentLedgerError } from './domain/errors';

export type { Tier, TierLimits } from './domain/limits';
export { limitsFor, tierFor } from './domain/limits';

export type { WithdrawalStatus } from './domain/withdrawal';
export type { DepositClaimStatus } from './domain/deposit-claim';
export type { ProofContentType } from './domain/proof-image';
export { MAX_PROOF_BYTES } from './domain/proof-image';

/*
 * The queries are NOT re-exported here. They log, and the logger is `server-only`
 * — the same trap `presence` and `activity` document. They live in `./server`.
 */
export type { ApprovalQueueDto } from './application/queries/pending-approvals';
export type {
  StatementDto,
  StatementLineDto,
  StatementOptions,
} from './application/queries/statement';
export type {
  DecisionAction,
  DecisionDto,
  OperationsSummaryDto,
} from './application/queries/operations-summary';
export type { DecisionTally } from './application/ports';
export type { TreasuryDto, TreasuryLineDto } from './application/queries/treasury';
export type { ReceiptDto, ReceiptLineDto } from './application/queries/receipt';
export type {
  TransactionDto,
  TransactionFeedOptions,
  TransactionKind,
  TransactionPageDto,
  TransactionStatus,
} from './application/queries/transactions';
export type { TransferKind } from './domain/transfer';

/* Risk signals — the rules and their wording, which the console renders. The
   *query* logs, so it lives in `./server` like every other read here. */
export type { RiskRule, RiskSeverity } from './domain/risk-signal';
export { RISK_RULES } from './domain/risk-signal';
export type { RiskDisposition } from './application/ports';
export type { RiskBoardDto, RiskSignalDto } from './application/queries/risk-signals';
