'use client';

import { useMemo } from 'react';
import { useLiveQuotes } from './use-markets';
import { HOLDINGS, AVAILABLE_CASH } from './data';
import type { ValuedHolding } from './types';

const ASSETS_HELD = HOLDINGS.map((h) => h.asset);

/**
 * Marks the portfolio to the live feed. Every derived figure on the dashboard —
 * total, P&L, weights, allocation — comes from this one hook, so a price tick
 * moves the whole surface together instead of leaving cards disagreeing.
 */
export function usePortfolio() {
  const quotes = useLiveQuotes(ASSETS_HELD);

  return useMemo(() => {
    const priced = HOLDINGS.map((holding) => {
      const quote = quotes.find((q) => q.id === holding.asset.id);
      const price = quote?.live ?? holding.asset.price;
      const value = holding.quantity * price;
      const invested = holding.quantity * holding.costBasis;
      return { holding, price, value, invested, direction: quote?.direction ?? 'flat', spark: quote?.spark ?? [] };
    });

    const total = priced.reduce((sum, p) => sum + p.value, 0);
    const invested = priced.reduce((sum, p) => sum + p.invested, 0);

    const holdings: (ValuedHolding & { price: number; direction: string; spark: readonly number[] })[] =
      priced
        .map((p) => ({
          ...p.holding,
          price: p.price,
          direction: p.direction,
          spark: p.spark,
          value: p.value,
          invested: p.invested,
          pnl: p.value - p.invested,
          pnlPercent: p.invested === 0 ? 0 : ((p.value - p.invested) / p.invested) * 100,
          weight: total === 0 ? 0 : (p.value / total) * 100,
        }))
        .sort((a, b) => b.value - a.value);

    return {
      holdings,
      total,
      invested,
      pnl: total - invested,
      pnlPercent: invested === 0 ? 0 : ((total - invested) / invested) * 100,
      cash: AVAILABLE_CASH,
      netWorth: total + AVAILABLE_CASH,
    };
  }, [quotes]);
}

/**
 * Allocation folded to at most `slots` slices plus "Other".
 * Part-to-whole reads at a glance only while the segment count stays small, so
 * the tail is aggregated rather than given more categorical hues.
 */
export function useAllocation(slots = 5) {
  const { holdings, total } = usePortfolio();
  return useMemo(() => {
    const head = holdings.slice(0, slots).map((h) => ({
      key: h.asset.symbol,
      label: h.asset.name,
      value: h.value,
      share: total === 0 ? 0 : (h.value / total) * 100,
    }));
    const tail = holdings.slice(slots);
    if (tail.length > 0) {
      const value = tail.reduce((s, h) => s + h.value, 0);
      head.push({
        key: 'Other',
        label: `Other (${tail.length} assets)`,
        value,
        share: total === 0 ? 0 : (value / total) * 100,
      });
    }
    return head;
  }, [holdings, total, slots]);
}
