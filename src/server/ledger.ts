import 'server-only';

import { cache } from 'react';

import type { ApprovalQueueDto, StatementDto, StatementOptions, WalletDto } from '@/modules/ledger';
import {
  getStatement,
  getWallet,
  LEDGER_ASSETS,
  listPendingApprovals,
  registerLedger,
  type LedgerModule,
  type PriceOracle,
} from '@/modules/ledger/server';
import { valueOf } from '@/modules/market-data';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { getMarkets } from './market-data';

/**
 * The application's facade over the ledger.
 *
 * ── This is the only place that knows the ledger and market-data both exist ────
 * The ledger needs USD values to enforce a daily withdrawal limit. It declares a
 * `PriceOracle` port and refuses to import a feed; market-data owns the prices and
 * has never heard of a balance. The adapter below is the join, and it lives here
 * for the same reason the presence/identity join does — above both, in the layer
 * whose job is composition.
 */

/**
 * One module instance per request.
 *
 * Not a singleton: a module-level instance would capture a database handle across
 * requests. Null when no database is configured, which every caller degrades
 * around rather than throwing.
 */
export const ledger = cache((): LedgerModule | null => {
  const handle = db();
  if (!handle) return null;

  return registerLedger({ db: handle, prices: marketPriceOracle });
});

/**
 * Values an amount in USD using the live market.
 *
 * ── It returns null rather than guessing, and that has teeth ───────────────────
 * `Market.quoteStateAt` distinguishes `live`, `stale` and `unavailable`, and this
 * adapter accepts **only `live`**. A stale quote is good enough to render on a
 * marketing page behind a "last updated" label; it is not good enough to decide how
 * much money may leave the platform. Those are different bars and this is the one
 * that should be higher.
 *
 * The consequence is deliberate and visible: when the feed goes quiet, withdrawals
 * stop rather than being approved against yesterday's prices. `requestWithdrawal`
 * turns the null into `valuation-unavailable`, and the wallet page explains it.
 */
const marketPriceOracle: PriceOracle = {
  async valueInUsd(amount: Money): Promise<Money | null> {
    if (amount.isZero) return Money.zero('USD', 2);

    // USD is its own valuation. Without this, a stablecoin balance would depend on
    // a feed quoting a dollar in dollars.
    if (amount.currency === 'USD') return amount.withScale(2);

    try {
      const markets = await getMarkets();
      const market = markets.find((candidate) => candidate.symbol === amount.currency);
      if (market === undefined || market.quote.state !== 'live') return null;

      // `valueOf` multiplies in `bigint` and divides once at the end, so the value
      // never passes through a float. The obvious `Number(price) * Number(amount)`
      // would be wrong at the one moment it is least affordable — deciding how much
      // money may leave the platform.
      return valueOf(amount, Money.fromDecimalString(market.quote.price, 'USD', 2));
    } catch (error) {
      logger.warn({ event: 'valuation_failed', module: 'ledger', asset: amount.currency }, error);
      return null;
    }
  },
};

const UNAVAILABLE_WALLET: WalletDto = {
  balances: [],
  totalValueUsd: null,
  valuationIncomplete: true,
  limits: {
    tier: 'standard',
    capUsd: '0.00',
    usedUsd: '0.00',
    remainingUsd: '0.00',
    resetsAt: new Date(0).toISOString(),
  },
  pendingWithdrawals: [],
  degraded: true,
};

/**
 * One customer's wallet.
 *
 * Deduplicated per request, so a page showing a total, a balance table and a limits
 * panel costs one read between them rather than three.
 */
export const getWalletFor = cache(async (userId: UserId): Promise<WalletDto> => {
  const context = ledger();
  if (context === null) return UNAVAILABLE_WALLET;

  return getWallet(context.dependencies, userId);
});

/** The operator queue. */
export const getApprovalQueue = cache(async (): Promise<ApprovalQueueDto> => {
  const context = ledger();
  if (context === null) {
    return { withdrawals: [], heldValueUsd: null, needingDualControl: 0, degraded: true };
  }

  return listPendingApprovals(context.dependencies);
});

/**
 * One customer's statement.
 *
 * Not deduplicated per request, unlike the wallet: it is parameterised by page and
 * asset, and `cache` keyed on nothing would return the first page to a caller
 * asking for the third.
 */
export async function getStatementFor(
  userId: UserId,
  options: StatementOptions = {},
): Promise<StatementDto> {
  const context = ledger();
  if (context === null) {
    return { lines: [], total: 0, limit: options.limit ?? 25, offset: 0, degraded: true };
  }

  return getStatement(context.dependencies, userId, options);
}

/** The withdrawal form's options: assets, networks, fees and minimums. */
export function withdrawableAssets() {
  return LEDGER_ASSETS.map((asset) => ({
    code: asset.code,
    name: asset.name,
    scale: asset.scale,
    minimumWithdrawal: asset.minimumWithdrawal,
    networks: asset.networks.map((network) => ({
      id: network.id,
      label: network.label,
      fee: network.fee,
      eta: network.eta,
    })),
  }));
}

/**
 * Deposit claims awaiting an operator.
 *
 * Deduplicated per request so the console's counter and its list cost one read.
 */
export const getPendingDepositClaims = cache(async () => {
  const context = ledger();
  if (context === null) return [];

  try {
    const claims = await context.dependencies.claims.listPending(100);
    return claims.map(toClaimView);
  } catch (error) {
    logger.error({ event: 'deposit_queue_read_failed', module: 'ledger' }, error);
    return [];
  }
});

/** One customer's own claims, for the wallet. */
export async function getDepositClaimsFor(userId: UserId) {
  const context = ledger();
  if (context === null) return [];

  try {
    const claims = await context.dependencies.claims.listForUser(userId, 20);
    return claims.map(toClaimView);
  } catch (error) {
    logger.warn({ event: 'deposit_claims_read_failed', module: 'ledger', userId }, error);
    return [];
  }
}

export interface DepositClaimView {
  readonly id: string;
  readonly userId: string;
  readonly asset: string;
  readonly network: string;
  readonly claimedAmount: string;
  readonly creditedAmount: string | null;
  readonly reference: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly submittedAt: string;
  readonly decidedAt: string | null;
  readonly reason: string | null;
}

/**
 * The claim, without its proof.
 *
 * `proofId` is deliberately absent: the image is fetched by its own authorised
 * route, keyed on the *claim* id, so a proof key never travels to a browser and
 * cannot be pasted into an unauthenticated request.
 */
function toClaimView(claim: {
  snapshot(): {
    id: string;
    userId: string;
    asset: string;
    network: string;
    claimedAmount: { toDecimalString(): string };
    creditedAmount: { toDecimalString(): string } | null;
    reference: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: Date;
    decidedAt: Date | null;
    reason: string | null;
  };
}): DepositClaimView {
  const s = claim.snapshot();
  return {
    id: s.id,
    userId: s.userId,
    asset: s.asset,
    network: s.network,
    claimedAmount: s.claimedAmount.toDecimalString(),
    creditedAmount: s.creditedAmount?.toDecimalString() ?? null,
    reference: s.reference,
    status: s.status,
    submittedAt: s.submittedAt.toISOString(),
    decidedAt: s.decidedAt?.toISOString() ?? null,
    reason: s.reason,
  };
}

/**
 * The bytes of one claim's proof, for a caller that has already proved it may see
 * them.
 *
 * Keyed on the claim, not the proof: the route that serves an image checks who is
 * asking against the claim's owner, and that check needs the claim in hand.
 */
export async function getDepositProof(
  claimId: string,
): Promise<{ bytes: Uint8Array; contentType: string; ownerId: string } | null> {
  const context = ledger();
  if (context === null) return null;

  const claim = await context.dependencies.claims.find(claimId);
  if (claim === null) return null;

  const proof = await context.dependencies.proofs.get(claim.proofId);
  if (proof === null) return null;

  return { bytes: proof.bytes, contentType: proof.contentType, ownerId: claim.userId };
}
