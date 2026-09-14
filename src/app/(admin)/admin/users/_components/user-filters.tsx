'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Search and status filters for the account list.
 *
 * ── The filter state lives in the URL, not in this component ───────────────────
 * Which is what makes the list a Server Component. The rows are queried on the
 * server from `searchParams`, so a filtered view is a shareable link, survives a
 * refresh, and does not ship the account table to the browser as JSON.
 *
 * The only thing that has to be interactive is the act of changing the URL, so
 * that is all this is.
 */
export function UserFilters({
  term,
  status,
  total,
}: {
  term: string;
  status: string;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [draft, setDraft] = useState(term);
  const timer = useRef<number | undefined>(undefined);

  // The input is uncontrolled with respect to navigation: typing updates local
  // state immediately and the URL catches up. Driving the value from the URL
  // instead would make every keystroke wait for a server round trip.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const push = (next: { term?: string; status?: string }) => {
    const query = new URLSearchParams(params.toString());

    if (next.term !== undefined) {
      if (next.term) query.set('q', next.term);
      else query.delete('q');
    }
    if (next.status !== undefined) {
      if (next.status && next.status !== 'all') query.set('status', next.status);
      else query.delete('status');
    }
    // Any filter change invalidates the page number — page three of the old
    // result set is not page three of the new one.
    query.delete('page');

    // `replace`, not `push`: typing six characters should not put six entries in
    // the back stack between the operator and where they came from.
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const onType = (value: string) => {
    setDraft(value);
    window.clearTimeout(timer.current);
    // Debounced, because each change is a database query. 300ms is below the
    // threshold where typing feels laggy and well above a single keystroke.
    timer.current = window.setTimeout(() => push({ term: value }), 300);
  };

  const active = status || 'all';

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <label className="relative flex min-w-0 flex-1 items-center sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 size-4 text-fg-subtle" />
        <span className="sr-only">Search accounts by email or account id</span>
        <input
          value={draft}
          onChange={(event) => onType(event.target.value)}
          placeholder="Email or account id"
          className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
        />
      </label>

      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-fg-subtle">
          {total} {total === 1 ? 'account' : 'accounts'}
        </span>
        <div className="flex items-center gap-1">
          {(['all', 'active', 'locked', 'disabled'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => push({ status: value })}
              aria-pressed={active === value}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                active === value
                  ? 'bg-surface-strong text-fg'
                  : 'text-fg-muted hover:bg-surface hover:text-fg',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
