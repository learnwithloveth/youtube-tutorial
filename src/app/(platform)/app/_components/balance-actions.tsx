import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownLeft, ArrowUpRight, CandlestickChart, Receipt } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/**
 * The four square actions under the balance.
 *
 * ── Every one of them goes somewhere that works ───────────────────────────────
 * The design these are ported from shows Buy, Swap, Send and Receive. Two of those
 * have nothing behind them here and are not rendered as if they do:
 *
 *  - **Buy** needs a fiat on-ramp. There is no card processor and no banking
 *    partner in this application, so the button would open a screen that cannot
 *    take money. The deposit flow — "send us a transfer, tell us you sent it" —
 *    is what exists, and `Receive` is what it is honestly called.
 *  - **Swap** needs a matching engine. `/app/trade` shows prices and has no order
 *    ticket, which `_data/navigation.ts` already notes. A prominent Swap tile
 *    pointing at a screen that cannot swap is the thing the settings page, the
 *    approvals queue and the markets page were each rewritten to remove.
 *
 * So the grid keeps its shape and its four tiles, and each label is a promise the
 * product can keep. This is the one place in this port where the design was
 * changed, which `AGENTS.md` rule 12 asks to be said at the site of the change.
 */

const ACTIONS: readonly {
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
}[] = [
  {
    label: 'Receive',
    href: '/app/wallet',
    icon: ArrowDownLeft,
    hint: 'Show a deposit address',
  },
  {
    label: 'Send',
    href: '/app/wallet',
    icon: ArrowUpRight,
    hint: 'Request a withdrawal',
  },
  {
    label: 'Portfolio',
    href: '/app/portfolio',
    icon: CandlestickChart,
    hint: 'Portfolio performance and market data',
  },
  {
    label: 'History',
    href: '/app/transactions',
    icon: Receipt,
    hint: 'Every movement on your statement',
  },
];

export function BalanceActions({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-4 gap-2.5', className)}>
      {ACTIONS.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          title={action.hint}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 py-4',
            'transition-colors duration-200 hover:border-line-strong hover:bg-surface-hover',
          )}
        >
          <action.icon className="size-5 text-fg" />
          <span className="text-xs font-medium text-fg">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
