import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, MailCheck, MailX, ShieldCheck, UserRound } from 'lucide-react';

import type { UserStatus } from '@/modules/identity';
import { getUsers } from '@/server/users';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { AdminPageHeader } from '../../_components/admin-ui';
import { Panel } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { UserFilters } from './_components/user-filters';

/**
 * Every account on the platform.
 *
 * ── This page used to be a fixture array ───────────────────────────────────────
 * Fifteen invented people with invented balances, risk scores and countries. The
 * columns that disappeared with them are worth naming, because they did not move
 * — they were never real and the contexts that would own them do not exist yet:
 *
 *   balance, 30d volume      a ledger context
 *   risk score, KYC state    a compliance context
 *   name, handle, country    a profile context
 *
 * Identity owns credentials and access state and nothing else, which is what keeps
 * it liftable into its own service. Adding a balance column here would mean adding
 * a balance field there, and that is how the forty-field user object forms that
 * every team edits and nobody understands.
 *
 * So this list is narrower than the mock it replaces, and every column on it is a
 * fact. What it gains is the link at the end of each row: real history, which no
 * fixture could have had.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Users',
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<UserStatus, 'up' | 'warn' | 'down'> = {
  active: 'up',
  locked: 'warn',
  disabled: 'down',
};

const PAGE_SIZE = 50;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  // Next 16: `searchParams` is a Promise, and reading it is what makes the route
  // dynamic — which this one has to be, since it reflects a live table.
  const params = await searchParams;

  const status = isStatus(params.status) ? params.status : undefined;
  const page = Math.max(Number(params.page ?? '1') || 1, 1);

  const list = await getUsers({
    term: params.q,
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const tally = (of: UserStatus) =>
    list.tallies.find((entry) => entry.status === of)?.total ?? 0;
  const allAccounts = list.tallies.reduce((sum, entry) => sum + entry.total, 0);

  const pages = Math.max(Math.ceil(list.total / PAGE_SIZE), 1);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Every account on the platform. Open one to see its sign-ins, the devices and places it connects from, and every page it has visited."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Accounts"
          value={String(allAccounts)}
          delta={{ value: `${tally('active')} active`, direction: 'flat', period: '' }}
          icon={<UserRound className="size-4" />}
        />
        <StatTile
          label="Locked"
          value={String(tally('locked'))}
          delta={{
            value: 'too many failed sign-ins',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
          icon={<ShieldCheck className="size-4" />}
        />
        <StatTile
          label="Disabled"
          value={String(tally('disabled'))}
          delta={{ value: 'no access permitted', direction: 'flat', period: '' }}
          upIsGood={false}
          icon={<MailX className="size-4" />}
        />
        <StatTile
          label="Unverified email"
          value={String(list.users.filter((user) => !user.emailVerified).length)}
          delta={{ value: `of ${list.users.length} shown`, direction: 'flat', period: '' }}
          upIsGood={false}
          icon={<MailCheck className="size-4" />}
        />
      </div>

      <Panel>
        <UserFilters term={params.q ?? ''} status={params.status ?? 'all'} total={list.total} />

        <TableShell caption="Platform accounts" minWidth="52rem">
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Status</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.users.length === 0 ? (
              <EmptyRow colSpan={6}>
                {params.q || status
                  ? 'No account matches that filter.'
                  : 'No accounts yet. The first person to sign up appears here.'}
              </EmptyRow>
            ) : (
              list.users.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="group flex min-w-0 items-center gap-3"
                    >
                      <span
                        aria-hidden
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-strong font-mono text-2xs uppercase text-fg-muted"
                      >
                        {user.email.slice(0, 2)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg group-hover:underline">
                          {user.email}
                        </span>
                        <span className="block font-mono text-2xs text-fg-subtle">
                          {user.id.slice(0, 8)}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[user.status]}>{user.status}</Badge>
                  </Td>
                  <Td>
                    {user.emailVerified ? (
                      <Badge tone="up">Verified</Badge>
                    ) : (
                      <Badge tone="neutral">Unverified</Badge>
                    )}
                  </Td>
                  <Td>
                    {user.role === 'admin' ? (
                      <Badge tone="warn">Operator</Badge>
                    ) : (
                      <span className="text-xs text-fg-subtle">Customer</span>
                    )}
                  </Td>
                  <Td>{formatDate(user.createdAt)}</Td>
                  <Td>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
                    >
                      Activity
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableShell>

        {pages > 1 ? (
          <nav
            aria-label="Account pages"
            className="mt-4 flex items-center justify-between text-xs text-fg-subtle"
          >
            <span>
              Page {page} of {pages}
            </span>
            <span className="flex gap-2">
              <PageLink params={params} page={page - 1} disabled={page <= 1}>
                Previous
              </PageLink>
              <PageLink params={params} page={page + 1} disabled={page >= pages}>
                Next
              </PageLink>
            </span>
          </nav>
        ) : null}
      </Panel>
    </>
  );
}

function isStatus(value: string | undefined): value is UserStatus {
  return value === 'active' || value === 'locked' || value === 'disabled';
}

/**
 * A pager link that preserves the current filter.
 *
 * An anchor rather than a button: paging is navigation, so it should be
 * middle-clickable and shareable, and it needs no JavaScript to work.
 */
function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: { q?: string; status?: string };
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="opacity-40">{children}</span>;

  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (page > 1) query.set('page', String(page));

  return (
    <Link href={`/admin/users?${query.toString()}`} className="hover:text-fg">
      {children}
    </Link>
  );
}
