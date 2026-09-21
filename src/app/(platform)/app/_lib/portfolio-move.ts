/**
 * The 24-hour market move on what an account holds *right now*.
 *
 * ── This is not portfolio performance, and the label must not say it is ───────
 * It answers one question: "if I had held these same amounts yesterday, what would
 * the market have done to them?" It is computable from two things that are real —
 * current balances and a live quote carrying a 24h change — and nothing else.
 *
 * What it is *not* is how this account's value has changed, because that also
 * depends on what moved in or out. Somebody who deposited a bitcoin this morning
 * has a portfolio that is up enormously and a market move of a fraction of a
 * percent. Reporting the second as the first is the same mistake the portfolio
 * page refuses to make with its absent performance chart: the honest version needs
 * a daily balance snapshot, which this system does not store.
 *
 * So the caller renders it under a caption saying what it measures. The function
 * is named for the same reason.
 *
 * ── Only live quotes count ────────────────────────────────────────────────────
 * A stale quote's 24h change is a 24h window that ended at some unknown point in
 * the past. Folding it in would move the headline number by an amount nobody can
 * date. Holdings without a live quote are excluded from both sides of the sum and
 * reported in `excluded`, so the caller can say so rather than quietly understate.
 */

export interface HoldingMove {
  /** USD worth now, as an exact decimal string from the ledger. */
  readonly valueUsd: string;
  /** The asset's 24h change, in percent, from a *live* quote. */
  readonly change24hPercent: number;
}

export interface MarketMove {
  /** Current worth of everything that could be measured. */
  readonly now: number;
  /** What the same amounts were worth 24 hours ago, at yesterday's prices. */
  readonly before: number;
  /** `now - before`, in USD. */
  readonly delta: number;
  /** The move as a percentage of `before`, or null when there is nothing to divide. */
  readonly percent: number | null;
  /** Holdings left out because nothing was quoting them live. */
  readonly excluded: number;
}

const NOTHING: MarketMove = { now: 0, before: 0, delta: 0, percent: null, excluded: 0 };

export function marketMove(
  holdings: readonly HoldingMove[],
  excluded: number,
): MarketMove {
  if (holdings.length === 0) return { ...NOTHING, excluded };

  let now = 0;
  let before = 0;
  let skipped = excluded;

  for (const holding of holdings) {
    const value = Number(holding.valueUsd);
    if (!Number.isFinite(value)) {
      skipped += 1;
      continue;
    }

    /*
     * Yesterday's worth, backed out of today's.
     *
     * `value / (1 + p/100)`. A change of exactly -100% would divide by zero — an
     * asset that went to nothing — so it is excluded rather than producing an
     * Infinity that would land on somebody's balance screen. It is a case that
     * cannot arise from a real feed and would be unmissable if it did.
     */
    const factor = 1 + holding.change24hPercent / 100;
    if (factor <= 0) {
      skipped += 1;
      continue;
    }

    now += value;
    before += value / factor;
  }

  const delta = now - before;

  return {
    now,
    before,
    delta,
    // Null rather than zero when there is nothing to measure against: "flat" and
    // "no answer" are different, and only one of them is a number.
    percent: before > 0 ? (delta / before) * 100 : null,
    excluded: skipped,
  };
}
