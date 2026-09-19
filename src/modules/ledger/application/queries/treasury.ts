import { logger } from '@/platform/observability/logger';
import { Money } from '@/shared/kernel';

import { platformOwner, type PlatformPurpose } from '../../domain/account';
import type { LedgerDependencies } from '../ports';

/**
 * What the platform itself holds.
 *
 * ── These are accounts, not wallets ────────────────────────────────────────────
 * The console's treasury screen used to show hot and cold wallets with addresses,
 * a float ratio and a rebalance button. None of that exists: there is no chain
 * client, no custody integration and no hot wallet — the approvals queue ends at
 * `payable`, which is money that has left the customer and not left the platform.
 *
 * What does exist is the other side of every double-entry transfer, and it is
 * genuinely the treasury:
 *
 *  - **custody** — negative by construction. Its magnitude is the total customer
 *    liability: everything owed to everybody, in one number per asset.
 *  - **fees** — revenue, credited when a withdrawal is approved.
 *  - **payable** — approved withdrawals not yet sent. The queue of obligations
 *    that something with a hot wallet would pick up.
 *  - **demo** — negative like custody, and the reason custody stays honest. Its
 *    magnitude is everything an operator issued for a workshop: money that was
 *    never received and is backed by nothing, kept out of the liability figure so
 *    that figure can still be reconciled against what is actually held.
 *
 * ── Why the liability is shown as a positive ───────────────────────────────────
 * `custody` is negative in the ledger because that is what makes a transfer sum to
 * zero. Showing an operator "-14.2 BTC" under "owed to customers" would invite
 * exactly the wrong reading, so the sign is flipped for display and the raw
 * balance is kept beside it.
 */

export interface TreasuryLineDto {
  readonly purpose: PlatformPurpose;
  readonly asset: string;
  /** Exact decimal string, as stored — signed. */
  readonly balance: string;
  /** The same figure as a magnitude, which is what the screen labels. */
  readonly magnitude: string;
  /** Worth in USD, or null when the asset could not be priced. */
  readonly valueUsd: string | null;
}

export interface TreasuryDto {
  readonly lines: readonly TreasuryLineDto[];
  /**
   * Total customer liability in USD, or null when any holding could not be priced.
   *
   * All-or-nothing, the same rule the wallet total follows: a sum that quietly
   * omits an unpriceable asset is wrong by exactly that asset's value, and wrong
   * without saying so — on the one number an operator would quote in a meeting.
   */
  readonly liabilityUsd: string | null;
  readonly feesUsd: string | null;
  readonly payableUsd: string | null;
  /**
   * Total demo funds issued, in USD.
   *
   * Reported separately and never folded into `liabilityUsd`. An operator reading
   * the treasury needs to be able to subtract it, and a single combined number
   * would make that impossible.
   */
  readonly demoUsd: string | null;
  readonly valuationIncomplete: boolean;
  readonly degraded: boolean;
}

const PURPOSES: readonly PlatformPurpose[] = ['custody', 'fees', 'payable', 'demo'];

const EMPTY: TreasuryDto = {
  lines: [],
  liabilityUsd: null,
  feesUsd: null,
  payableUsd: null,
  demoUsd: null,
  valuationIncomplete: true,
  degraded: true,
};

export async function getTreasury(deps: LedgerDependencies): Promise<TreasuryDto> {
  // `allSettled`, not `all`: three independent reads, and the realistic failure is
  // an unreachable database in which all three reject — `Promise.all` would leave
  // two rejections unattached, which Node terminates the process for.
  const results = await Promise.allSettled(
    PURPOSES.map((purpose) => deps.accounts.listForOwner(platformOwner(purpose))),
  );

  if (results.every((result) => result.status === 'rejected')) {
    logger.error({ event: 'treasury_read_failed', module: 'ledger' });
    return EMPTY;
  }

  const lines: TreasuryLineDto[] = [];
  let incomplete = false;

  for (const [index, result] of results.entries()) {
    const purpose = PURPOSES[index];
    if (result.status === 'rejected' || purpose === undefined) {
      incomplete = true;
      continue;
    }

    for (const account of result.value) {
      const snapshot = account.snapshot();
      if (snapshot.balance.isZero) continue;

      const magnitude = snapshot.balance.isNegative
        ? snapshot.balance.negate()
        : snapshot.balance;

      const valueUsd = await deps.prices.valueInUsd(magnitude).catch(() => null);
      if (valueUsd === null) incomplete = true;

      lines.push({
        purpose,
        asset: snapshot.asset,
        balance: snapshot.balance.toDecimalString(),
        magnitude: magnitude.toDecimalString(),
        valueUsd: valueUsd?.toDecimalString() ?? null,
      });
    }
  }

  /** All-or-nothing per purpose — see `liabilityUsd`. */
  const totalFor = (purpose: PlatformPurpose): string | null => {
    const rows = lines.filter((line) => line.purpose === purpose);
    if (rows.length === 0) return Money.zero('USD', 2).toDecimalString();
    if (rows.some((line) => line.valueUsd === null)) return null;

    return rows
      .reduce(
        (sum, line) => sum.add(Money.fromDecimalString(line.valueUsd ?? '0', 'USD', 2)),
        Money.zero('USD', 2),
      )
      .toDecimalString();
  };

  return {
    lines,
    liabilityUsd: totalFor('custody'),
    feesUsd: totalFor('fees'),
    payableUsd: totalFor('payable'),
    demoUsd: totalFor('demo'),
    valuationIncomplete: incomplete,
    degraded: results.some((result) => result.status === 'rejected'),
  };
}
