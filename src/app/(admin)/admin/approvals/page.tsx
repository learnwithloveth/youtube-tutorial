import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Clock,
  ShieldAlert,
  TriangleAlert,
  Users,
} from 'lucide-react';

import type { UserSummaryDto } from '@/modules/identity';
import { getApprovalQueue, getPendingDepositClaims } from '@/server/ledger';
import { identity } from '@/server/auth';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { AdminPageHeader, EmptyState } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { usd } from '../../../(platform)/app/_lib/format-usd';
import { DecisionForm } from './_components/decision-form';
import { DepositDecision } from './_components/deposit-decision';

/**
 * Withdrawals waiting on a decision.
 *
 * ── This page is the other half of the wallet ──────────────────────────────────
 * A customer's request places a hold and lands here. Approving posts the balanced
 * transfer that actually moves the money; rejecting releases the hold and says why.
 * Both write back to the same ledger the wallet reads, so the two screens are never
 * describing different states of the world.
 *
 * ── It replaced a fixture queue ────────────────────────────────────────────────
 * The previous version reduced over an in-memory array that a refresh reset, with
 * invented risk scores and signals. Those are gone rather than reimplemented: a
 * risk score needs a surveillance context that does not exist, and a number
 * presented as risk that is actually `Math.random()` is worse than no number on the
 * one screen where someone decides whether to release funds.
 *
 * What replaced them is smaller and true: the amount, its frozen valuation, the
 * destination, how long it has waited, and whether it needs a second signature.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Approvals',
  robots: { index: false, follow: false },
};

export default async function ApprovalsPage() {
  const [queue, deposits] = await Promise.all([
    getApprovalQueue(),
    getPendingDepositClaims(),
  ]);

  // The ledger holds an opaque `UserId` and never reads `identity.users`. The join
  // happens here, above both, which is the same arrangement the live board uses.
  const accounts = await describeRequesters([
    ...queue.withdrawals.map((w) => w.userId),
    ...deposits.map((d) => d.userId),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Approvals"
        description="Every withdrawal is held until an operator decides. Approving moves money; rejecting releases the hold and tells the customer why."
      />

      {queue.degraded ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-sm text-fg">
            The queue could not be read.{' '}
            <span className="text-fg-muted">
              This is a failed query, not an empty queue — do not read the zero below
              as &ldquo;nothing is waiting&rdquo;.
            </span>
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Awaiting a decision"
          value={String(queue.withdrawals.length)}
          delta={{ value: 'oldest first', direction: 'flat', period: '' }}
          upIsGood={false}
          icon={<Clock className="size-4" />}
        />
        <StatTile
          label="Value held"
          value={queue.heldValueUsd === null ? '—' : usd(queue.heldValueUsd)}
          delta={{
            value:
              queue.heldValueUsd === null
                ? 'something could not be priced'
                : 'valued when requested',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
        />
        <StatTile
          label="Need two signatures"
          value={String(queue.needingDualControl)}
          delta={{ value: 'over the dual-control threshold', direction: 'flat', period: '' }}
          upIsGood={false}
          icon={<ShieldAlert className="size-4" />}
        />
      </div>

      {deposits.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-fg">
            <ArrowDownToLine className="size-4 text-up" />
            Deposits awaiting confirmation
            <span className="rounded-full bg-surface-strong px-2 py-0.5 text-2xs tabular-nums text-fg-muted">
              {deposits.length}
            </span>
          </h2>

          <div className="space-y-3">
            {deposits.map((claim) => {
              const account = accounts.get(claim.userId);

              return (
                <Panel key={claim.id} id={`claim-${claim.id}`}>
                  <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr_1fr]">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-semibold text-fg">
                        {claim.claimedAmount} {claim.asset}
                      </p>
                      <p className="mt-0.5 text-2xs text-fg-subtle">claimed by the customer</p>

                      <dl className="mt-4 space-y-2.5 text-xs">
                        <Field label="Account">
                          {account ? (
                            <Link
                              href={`/admin/users/${account.id}`}
                              className="truncate text-brand-soft hover:underline"
                            >
                              {account.email}
                            </Link>
                          ) : (
                            <span className="font-mono text-fg-subtle">
                              {claim.userId.slice(0, 8)}
                            </span>
                          )}
                        </Field>
                        <Field label="Network">{claim.network}</Field>
                        <Field label="Submitted">{formatDate(claim.submittedAt)}</Field>
                        {/* Only when there is one. The customer's form stopped
                            asking for a transaction hash, so most claims carry
                            none, and an empty row under a "Reference" label reads
                            as a value that failed to load. */}
                        {claim.reference.trim().length === 0 ? null : (
                          <Field label="Reference" wide>
                            <span className="font-mono break-all">{claim.reference}</span>
                          </Field>
                        )}
                      </dl>

                      <p className="mt-3 flex items-start gap-2 text-2xs leading-relaxed text-fg-subtle">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                        Find the transfer on chain before crediting, and credit what you
                        find. The screenshot is the customer&rsquo;s claim, not evidence
                        on its own.
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-2 text-2xs uppercase tracking-[0.12em] text-fg-subtle">
                        Proof
                      </p>
                      {/* Served by an authorised route that re-checks who is asking.
                          The proof key never reaches the browser — the URL is keyed
                          on the claim. */}
                      <a
                        href={`/api/deposits/${claim.id}/proof`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block overflow-hidden rounded-lg border border-line transition-colors hover:border-line-strong"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element --
                            next/image would proxy this through the optimiser, which
                            caches by URL and would leave a customer's bank screenshot
                            in a shared cache. A plain img keeps it on the no-store
                            route that authorises every request. */}
                        <img
                          src={`/api/deposits/${claim.id}/proof`}
                          alt={`Deposit proof for ${claim.reference}`}
                          className="max-h-64 w-full bg-surface object-contain"
                        />
                      </a>
                      <p className="mt-1.5 text-2xs text-fg-subtle">Opens full size</p>
                    </div>

                    <div className="lg:border-l lg:border-line lg:pl-5">
                      <DepositDecision claim={claim} />
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>
      ) : null}

      <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-fg">
        <ArrowUpFromLine className="size-4 text-down" />
        Withdrawals awaiting a decision
      </h2>

      {queue.withdrawals.length === 0 && !queue.degraded ? (
        <EmptyState
          title="Nothing is waiting"
          body="Withdrawals appear here the moment a customer requests one. Their balance is held, not spent, until you decide."
        />
      ) : (
        <div className="space-y-3">
          {queue.withdrawals.map((withdrawal) => {
            const account = accounts.get(withdrawal.userId);
            const dual = withdrawal.approvalsRequired > 1;

            return (
              <Panel key={withdrawal.id} id={`withdrawal-${withdrawal.id}`}>
                <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-semibold text-fg">
                        {withdrawal.amount} {withdrawal.asset}
                      </span>
                      {withdrawal.valueUsd === null ? (
                        <Badge tone="warn">Not priced</Badge>
                      ) : (
                        <span className="text-sm text-fg-muted">
                          ≈ {usd(withdrawal.valueUsd)}
                        </span>
                      )}
                      {dual ? (
                        <Badge tone="warn">
                          <ShieldAlert className="size-3" />
                          {withdrawal.approvalsHeld}/{withdrawal.approvalsRequired} signatures
                        </Badge>
                      ) : null}
                    </div>

                    <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2">
                      <Field label="Account">
                        {account ? (
                          <Link
                            href={`/admin/users/${account.id}`}
                            className="truncate text-brand-soft hover:underline"
                          >
                            {account.email}
                          </Link>
                        ) : (
                          <span className="font-mono text-fg-subtle">
                            {withdrawal.userId.slice(0, 8)}
                          </span>
                        )}
                      </Field>
                      <Field label="Requested">{formatDate(withdrawal.requestedAt)}</Field>
                      <Field label="Network">{withdrawal.network}</Field>
                      <Field label="Network fee">
                        <span className="font-mono">
                          {withdrawal.fee} {withdrawal.asset}
                        </span>
                      </Field>
                      <Field label="Destination" wide>
                        <span className="font-mono break-all">{withdrawal.destination}</span>
                      </Field>
                    </dl>

                    {account && account.status !== 'active' ? (
                      <p className="mt-3 flex items-center gap-2 rounded-md border border-warn/35 bg-warn/8 px-3 py-2 text-2xs text-fg">
                        <TriangleAlert className="size-3.5 shrink-0 text-warn" />
                        This account is {account.status}. Releasing funds from it is
                        probably not what you want.
                      </p>
                    ) : null}

                    {account && !account.emailVerified ? (
                      <p className="mt-2 flex items-center gap-2 text-2xs text-fg-subtle">
                        <Users className="size-3.5 shrink-0" />
                        Email has never been verified on this account.
                      </p>
                    ) : null}
                  </div>

                  <div className="lg:border-l lg:border-line lg:pl-5">
                    <p className="mb-3 flex items-center gap-1.5 text-xs text-fg-subtle">
                      <BadgeCheck className="size-3.5" />
                      {dual
                        ? 'Two different operators must approve this.'
                        : 'One approval releases these funds.'}
                    </p>
                    <DecisionForm withdrawal={withdrawal} />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-2xs uppercase tracking-[0.12em] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 min-w-0 truncate text-fg-muted">{children}</dd>
    </div>
  );
}

/**
 * Resolves the accounts behind a queue of withdrawals.
 *
 * Tolerates an identity outage: losing the email costs the operator a name, and
 * they can still see the amount, the destination and how long it has waited. A
 * throw here would blank the queue entirely.
 */
async function describeRequesters(
  ids: readonly string[],
): Promise<Map<string, UserSummaryDto>> {
  if (ids.length === 0) return new Map();

  try {
    const userIds = [...new Set(ids)].flatMap((id) => {
      try {
        return [toUserId(id)];
      } catch {
        return [];
      }
    }) as UserId[];

    return await identity().describeUsers(userIds);
  } catch {
    return new Map();
  }
}

