import type { Metadata } from 'next';
import Link from 'next/link';
import { Coins, Mail, ScrollText, Search, TriangleAlert } from 'lucide-react';

import { formatAccountNumber } from '@/modules/identity';
import { smtpConfig } from '@/platform/env';
import { requireAdmin } from '@/server/auth';
import { fundableAssets, ledger } from '@/server/ledger';
import { getUsers } from '@/server/users';
import { Badge } from '@/shared/ui/primitives/badge';

import { AdminPageHeader } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { GrantForm } from './_components/grant-form';

/**
 * Demo funds.
 *
 * ── Why this screen exists, and why it is not a deposit form ──────────────────
 * A tutor running a workshop needs twenty student accounts to have something in
 * them before anybody can be shown what a withdrawal looks like. Before this, the
 * only way to put a balance on an account was `recordDeposit`, which requires a
 * reference to something that actually arrived — and there is nothing to
 * reference, because nothing arrived.
 *
 * So the ledger grew a use case that says so out loud. Every grant made here is
 * drawn from the `demo` contra account rather than `custody`, and written with the
 * transfer kind `demo-credit`. The consequences are the point:
 *
 *  - the platform's stated liability to its customers does not move, so the one
 *    number on the treasury screen meant to be checkable against real holdings
 *    stays checkable;
 *  - the student's own statement says "Demo funds", not "Deposit";
 *  - the audit log records who issued it, against the account that received it.
 *
 * `domain/account.ts` and `use-cases/grant-demo-funds.ts` carry the reasoning in
 * full. This page is the form in front of it.
 *
 * ── An operator can fund their own account ────────────────────────────────────
 * Deliberately, and it needs no special case: an operator is an account like any
 * other and appears in this list, badged. Dual control exists on the *withdrawal*
 * path, where value leaves the platform and self-approval would be the obvious
 * attack. Nothing leaves here — a demo grant credits an account from one that is
 * allowed to go negative — so a rule against funding yourself would block a tutor
 * demonstrating on their own screen and prevent nothing.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fund user',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

export default async function DemoFundsPage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise, and reading it is what makes this route
  // dynamic — which it has to be, since it reflects a live account list.
  searchParams: Promise<{ q?: string }>;
}) {
  const operator = await requireAdmin('/admin/demo-funds');
  const { q } = await searchParams;

  const list = await getUsers({ term: q, limit: PAGE_SIZE });
  // Read from the catalogue in code, not the database — see `assets.ts` for why a
  // storage scale is a constant rather than a row.
  const assets = fundableAssets();

  const unavailable = ledger() === null;
  // Asked here rather than inside the form: with no SMTP the platform's transport
  // logs a message and reports success, so a form that offered to email would be
  // reporting a send that never happened.
  const mailConfigured = smtpConfig() !== null;

  return (
    <>
      <AdminPageHeader
        title="Fund user"
        description=""
      />

      {unavailable ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-bg-elev px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-fg-muted">
            No database is configured on this deployment, so nothing can be credited.
          </p>
        </div>
      ) : null}

    
      <Panel>
        <PanelHeader
          title="Accounts"
          subtitle={
            q
              ? `${list.total} matching “${q}”`
              : `${list.total} on the platform${list.total > PAGE_SIZE ? ` — showing the newest ${PAGE_SIZE}` : ''}`
          }
        />

        {/* A plain GET form, so a search is a URL an operator can bookmark or read
            back off the address bar — and so the page needs no client state to
            remember what was typed. */}
        <form method="get" className="mb-4 flex items-center gap-2">
          <label className="sr-only" htmlFor="demo-funds-search">
            Find an account
          </label>
          <span className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              id="demo-funds-search"
              name="q"
              defaultValue={q ?? ''}
              autoComplete="off"
              placeholder="Account number, email, or account id"
              className="w-full rounded-lg border border-line bg-bg-elev py-2 pl-9 pr-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-brand-soft"
            />
          </span>
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:border-brand-soft/60 hover:text-fg"
          >
            Search
          </button>
        </form>

        <TableShell caption="Accounts that can be funded" minWidth="58rem">
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Account number</Th>
              <Th>
                <span className="sr-only">Add funds</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.users.length === 0 ? (
              <EmptyRow colSpan={3}>
                {q
                  ? 'No account matches that. An account number is ten digits — spaces are fine.'
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
                        {user.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm text-fg group-hover:underline">
                            {user.name}
                          </span>
                          {user.id === operator.id ? <Badge tone="brand">You</Badge> : null}
                          {user.role === 'admin' && user.id !== operator.id ? (
                            <Badge tone="warn">Operator</Badge>
                          ) : null}
                        </span>
                        <span className="block truncate text-2xs text-fg-subtle">
                          {user.email}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span data-numeric className="font-mono text-xs text-fg-muted">
                      {formatAccountNumber(user.accountNumber)}
                    </span>
                  </Td>
                  <Td>
                    <GrantForm
                      userId={user.id}
                      assets={assets}
                      mailConfigured={mailConfigured}
                      compact
                    />
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableShell>

        <ul className="mt-4 grid gap-1.5 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
          <li>
            <Coins className="mr-1.5 inline size-3 align-[-1px]" />
            An asset that travels on more than one chain asks which — USDT over Tron
            or Ethereum, bitcoin on-chain or over Lightning. They differ in fee,
            address format, and the coin a withdrawal is eventually paid for with. It
            is still one balance per asset either way: the network is the route in,
            exactly as on a real exchange, not a pot of its own.
          </li>
          <li>
            <Mail className="mr-1.5 inline size-3 align-[-1px]" />
            {mailConfigured
              ? 'Ticking Email tells the student, in a message that says plainly these are demo funds and that nothing is owed to them.'
              : 'No mail server is configured on this deployment, so the email option is unavailable.'}
          </li>
          <li>
            <ScrollText className="mr-1.5 inline size-3 align-[-1px]" />
            Every grant is written to the audit log against the account that received
            it, naming the operator who issued it. There is no clawback — taking funds
            back is a second transfer in the other direction, and this screen
            deliberately only credits.
          </li>
        </ul>
      </Panel>
    </>
  );
}
