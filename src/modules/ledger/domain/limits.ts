import { Money } from '@/shared/kernel';

/**
 * How much may leave, and how many signatures it takes.
 *
 * ── Why the limits are denominated in USD ──────────────────────────────────────
 * A cap per asset would have to be restated every time an asset moved, and would
 * be trivially avoidable: "0.5 BTC a day" is a different amount of money each
 * morning, and someone at their bitcoin limit simply withdraws ether instead. The
 * thing worth bounding is value leaving the platform, so the limit is in value.
 *
 * The consequence is that a withdrawal cannot be checked without a price, and
 * `requestWithdrawal` therefore **refuses** when none is available rather than
 * waving it through. That is the correct direction to fail: an exchange that keeps
 * paying out while it has lost sight of what things are worth is the one that
 * discovers the problem afterwards.
 */

/**
 * Tiers.
 *
 * The ladder is here because "how much may leave per day" is a ledger rule. Which
 * tier an account is *on* is not: that is a function of traded volume and KYC
 * standing, which belong to contexts this application has not built. Every account
 * is therefore on `standard`, and `tierFor` is the single place that changes when
 * one of those contexts arrives.
 */
export type Tier = 'standard' | 'gold' | 'platinum' | 'institutional';

export interface TierLimits {
  readonly tier: Tier;
  /** Most value that may leave in a rolling day, in USD. */
  readonly dailyWithdrawalUsd: Money;
  /**
   * Above this, one signature is not enough.
   *
   * Dual control is about the operator, not the customer: it is the control that
   * makes a single compromised or dishonest console account unable to move a large
   * sum on its own. The threshold is deliberately well below the daily cap, so the
   * common case stays single-signature and the rule still catches anything large.
   */
  readonly dualControlUsd: Money;
}

function usd(amount: string): Money {
  return Money.fromDecimalString(amount, 'USD', 2);
}

const LIMITS: Record<Tier, TierLimits> = {
  standard: {
    tier: 'standard',
    dailyWithdrawalUsd: usd('25000.00'),
    dualControlUsd: usd('10000.00'),
  },
  gold: {
    tier: 'gold',
    dailyWithdrawalUsd: usd('250000.00'),
    dualControlUsd: usd('50000.00'),
  },
  platinum: {
    tier: 'platinum',
    dailyWithdrawalUsd: usd('1000000.00'),
    dualControlUsd: usd('100000.00'),
  },
  institutional: {
    tier: 'institutional',
    // Uncapped in the product copy, which in a ledger means a number large enough
    // that the desk's risk review is the real control — not `Infinity`, which is
    // not a Money and would make the comparison below meaningless.
    dailyWithdrawalUsd: usd('100000000.00'),
    dualControlUsd: usd('250000.00'),
  },
};

export function limitsFor(tier: Tier): TierLimits {
  return LIMITS[tier];
}

/**
 * Everyone is `standard`.
 *
 * Not a placeholder to be filled in later with a guess: it is the honest answer
 * until a context exists that can say otherwise. The wallet page says "Standard
 * tier" for the same reason — showing someone a Gold badge they were never
 * assessed for is the fixture problem in a different costume.
 */
export function tierFor(): Tier {
  return 'standard';
}

/** How many operator signatures a withdrawal of this value needs. */
export function approvalsRequired(valuedAtUsd: Money | null, limits: TierLimits): number {
  // No valuation is treated as large. The alternative — assume it is small — makes
  // a missing price the cheapest way to bypass dual control.
  if (valuedAtUsd === null) return 2;
  return valuedAtUsd.compare(limits.dualControlUsd) >= 0 ? 2 : 1;
}

export interface LimitCheck {
  readonly allowed: boolean;
  readonly usedUsd: Money;
  readonly remainingUsd: Money;
  readonly capUsd: Money;
}

/**
 * Whether one more withdrawal of this value fits inside the day's remaining room.
 *
 * `usedUsd` counts pending *and* approved withdrawals. Counting only approved ones
 * would let someone queue twenty requests inside a minute, each individually under
 * the cap, and have the sum approved later — the limit has to bind when the request
 * is made, not when it is decided.
 */
export function checkDailyLimit(
  valuedAtUsd: Money,
  usedUsd: Money,
  limits: TierLimits,
): LimitCheck {
  const cap = limits.dailyWithdrawalUsd;
  const remaining = cap.subtract(usedUsd);

  return {
    allowed: valuedAtUsd.compare(remaining) <= 0,
    usedUsd,
    // Never negative: a cap lowered while withdrawals were already counted against
    // it would otherwise render as a negative allowance on the customer's page.
    remainingUsd: remaining.isNegative ? Money.zero('USD', 2) : remaining,
    capUsd: cap,
  };
}
