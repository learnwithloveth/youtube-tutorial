import { Menu, Search, ShieldCheck } from 'lucide-react';
import { ACTING_ADMIN } from '../_data/data';
import { useQueues } from '../_data/store';
import { ThemeToggle } from '../../(marketing)/_components/theme-toggle';
import { cn } from '@/shared/lib/cn';

import { AdminNotificationBell, type AdminFeed } from './admin-notifications';
import { InstallConsoleButton } from './install-console-button';

/**
 * Carries the two facts an operator must never have to go looking for: which
 * environment they are acting in, and who they are acting as. Both are load
 * bearing — a mis-read on either is how production incidents start.
 */
export function AdminTopBar({
  email,
  operatorId,
  feed,
  onOpenDrawer,
}: {
  email: string;
  operatorId: string;
  feed: AdminFeed;
  onOpenDrawer: () => void;
}) {
  const queues = useQueues();
  const waiting = queues.approvals + queues.kyc + queues.tickets;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-[3.75rem] items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="grid size-9 shrink-0 place-items-center rounded-sm border border-line text-fg-muted transition-colors hover:text-fg lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warn/40 bg-warn/12 px-2.5 py-1 font-mono text-2xs font-semibold uppercase tracking-[0.14em] text-warn">
          <span aria-hidden className="size-1.5 rounded-full bg-warn" />
          Production
        </span>

        <label className="relative hidden max-w-sm flex-1 md:block">
          <span className="sr-only">Search users, transactions, tickets and markets</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            placeholder="Search users, references, tickets…"
            className="h-9 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-brand-soft"
          />
        </label>

        <div className="ml-auto flex items-center gap-3">
          <p className={cn('hidden text-2xs sm:block', waiting > 0 ? 'text-warn' : 'text-fg-subtle')}>
            <span className="font-semibold tabular-nums">{waiting}</span> item
            {waiting === 1 ? '' : 's'} awaiting action
          </p>

          <InstallConsoleButton className="size-9" />

          <AdminNotificationBell feed={feed} operatorId={operatorId} />

          <ThemeToggle className="size-9" />

          <div className="flex items-center gap-2.5 rounded-full border border-line py-1 pl-1 pr-3">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ background: `linear-gradient(140deg, ${ACTING_ADMIN.hue}, color-mix(in oklab, ${ACTING_ADMIN.hue} 40%, var(--bg)))` }}
            >
              {ACTING_ADMIN.initials}
            </span>
            <span className="hidden leading-tight sm:block">
              {/* The address is the real signed-in operator; the avatar and name
                  beside it are demo persona — see _console/data/README.md. */}
              <span className="block max-w-[14rem] truncate text-xs font-medium text-fg">
                {email}
              </span>
              <span className="flex items-center gap-1 text-2xs text-fg-subtle">
                <ShieldCheck className="size-2.5" />
                {ACTING_ADMIN.role}
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
