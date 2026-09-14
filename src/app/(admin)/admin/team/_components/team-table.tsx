'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { BadgeCheck, TriangleAlert } from 'lucide-react';

import type { AdministratorDto } from '@/modules/identity';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';

import { setAdminStatusAction } from '../_lib/actions';
import { IDLE_TEAM_FORM } from '../_lib/form-state';

/**
 * The roster, with the one action this screen is allowed to take.
 *
 * ── One form state for the whole table ─────────────────────────────────────────
 * Every row submits to the same action and shares its result. That is deliberate:
 * the outcomes worth showing — "you cannot suspend yourself", "this is the last
 * active administrator" — are about the *console*, not about one row, and a
 * message pinned under a particular person would read as being about them.
 *
 * ── There is no Suspend button beside your own name ───────────────────────────
 * The use case refuses it, because a Server Action is a public endpoint and the
 * absence of a button protects nothing. It is absent here as well so that nobody
 * discovers the rule by being told off — the same reason the console hides a
 * Claim button on a thread you already hold.
 */
export function TeamTable({
  administrators,
  present,
  viewerId,
}: {
  administrators: readonly AdministratorDto[];
  /** Ids with a heartbeat right now — the live board's, not a second source. */
  present: readonly string[];
  viewerId: string;
}) {
  const [state, submit, pending] = useActionState(setAdminStatusAction, IDLE_TEAM_FORM);
  const here = new Set(present);

  return (
    <>
      {state.message !== null ? (
        <p
          role="status"
          className={cn(
            'mx-5 mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed',
            state.status === 'error'
              ? 'border-down/35 bg-down/8 text-fg'
              : 'border-up/35 bg-up/8 text-fg',
          )}
        >
          {state.status === 'error' ? (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-down" />
          ) : (
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-up" />
          )}
          {state.message}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-surface">
            <tr className="text-2xs uppercase tracking-[0.12em] text-fg-subtle">
              <th className="px-5 py-2.5 font-medium">Administrator</th>
              <th className="px-3 py-2.5 font-medium">Last active</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 text-right font-medium">{''}</th>
            </tr>
          </thead>
          <tbody>
            {administrators.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-xs text-fg-subtle">
                  No administrators. Grant the first one with{' '}
                  <code className="font-mono">pnpm admin:grant</code>.
                </td>
              </tr>
            ) : (
              administrators.map(({ account, lastSeenAt }) => {
                const self = account.id === viewerId;
                const suspended = account.status !== 'active';

                return (
                  <tr key={account.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="relative grid size-8 shrink-0 place-items-center rounded-full bg-brand/20 text-2xs font-semibold text-brand-soft"
                        >
                          {account.initials}
                          {here.has(account.id) ? (
                            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg-elev bg-up" />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <Link
                            href={`/admin/users/${account.id}`}
                            className="block truncate font-medium text-fg hover:underline"
                          >
                            {account.name}
                            {self ? <span className="text-fg-subtle"> · you</span> : null}
                          </Link>
                          <span className="block truncate text-2xs text-fg-subtle">
                            {account.email}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-fg-muted">
                      {/* Absent is an answer, not a gap: no live session means
                          nobody is signed in, which is different from unknown. */}
                      {lastSeenAt === null ? (
                        <span className="text-fg-subtle">No live session</span>
                      ) : here.has(account.id) ? (
                        <span className="text-up">Now</span>
                      ) : (
                        formatDate(lastSeenAt)
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {/* `locked` and `disabled` are both "cannot sign in", and the
                          row says which — one was a decision, the other a run of
                          bad passwords, and they are undone differently. */}
                      <Badge tone={suspended ? 'down' : 'up'}>{account.status}</Badge>
                    </td>

                    <td className="px-5 py-3 text-right">
                      {self ? (
                        <span className="text-2xs text-fg-subtle">
                          Ask another administrator
                        </span>
                      ) : (
                        <form action={submit} className="inline">
                          <input type="hidden" name="targetId" value={account.id} />
                          <input
                            type="hidden"
                            name="action"
                            value={suspended ? 'reinstate' : 'suspend'}
                          />
                          <button
                            type="submit"
                            disabled={pending}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                              suspended
                                ? 'border-up/40 bg-up/10 text-up hover:border-up/70 hover:bg-up/18'
                                : 'border-down/40 bg-down/10 text-down hover:border-down/70 hover:bg-down/18',
                              'disabled:pointer-events-none disabled:opacity-40',
                            )}
                          >
                            {suspended ? 'Reinstate' : 'Suspend'}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
