import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';

import type { TreasuryLineDto } from '@/modules/ledger';
import { requireAdmin } from '@/server/auth';
import { getPlatformTreasury } from '@/server/ledger';
import { cn } from '@/shared/lib/cn';
import { StatTile } from '@/shared/ui/charts/stat-tile';

import { AdminPageHeader } from '../../_components/admin-ui';
import { Panel, PanelHeader } from '../../../_console/components/page-header';
import { usd } from '../../../(platform)/app/_lib/format-usd';

/**
 * Treasury.
 *
 * ── What this page used to claim ───────────────────────────────────────────────
 * Hot and cold wallets with addresses, a float ratio against a 2% ceiling, and a
 * rebalance button. None of it existed: this application has no chain client, no
 * custody integration and no hot wallet. The approvals queue ends at `payable` —
 * money that has left the customer and not left the platform — and something with
 * a hot wallet would have to pick those up. That something is not built.
 *
 * ── What is actually here ──────────────────────────────────────────────────────
 * The other side of every double-entry transfer, which is genuinely the treasury:
 * what is owed to customers, what has been earned in fees, and what is approved
 * and waiting to be sent. Three real balances per asset, from the same rows the
 * wallet and the approvals queue read.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Treasury',
  robots: { index: false, follow: false },
};

const SECTIONS = [
  {
    purpose: 'custody' as const,
    title: 'Owed to customers',
    subtitle: 'Every balance the platform holds on somebody else’s behalf',
  },
  {
    purpose: 'payable' as const,
    title: 'Approved, not yet sent',
    subtitle: 'Withdrawals that have left the customer and not left the platform',
  },
  {
    purpose: 'fees' as const,
    title: 'Fee revenue',
    subtitle: 'Credited when a withdrawal is approved',
  },
];

export default async function TreasuryPage() {
  await requireAdmin('/admin/treasury');
  const treasury = await getPlatformTreasury();

  return (
    <>
      <AdminPageHeader
        title="Treasury"
        description="What the platform holds, owes and has earned — the platform side of every transfer."
      />

      {treasury.degraded ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-xs leading-relaxed text-fg-muted">
            Some accounts could not be read. The figures below are incomplete —
            treat them as a partial view, not a balance sheet.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Owed to customers"
          // Null is a state, not a gap: a dash says a holding could not be priced,
          // where a zero would say the platform owes nothing.
          value={treasury.liabilityUsd === null ? '—' : usd(treasury.liabilityUsd)}
          delta={{
            value:
              treasury.liabilityUsd === null
                ? 'Not every holding could be priced'
                : 'Total customer liability',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
        />
        <StatTile
          label="Approved, not yet sent"
          value={treasury.payableUsd === null ? '—' : usd(treasury.payableUsd)}
          delta={{ value: 'Waiting on a payout run', direction: 'flat', period: '' }}
          upIsGood={false}
        />
        <StatTile
          label="Fee revenue"
          value={treasury.feesUsd === null ? '—' : usd(treasury.feesUsd)}
          delta={{ value: 'Since the ledger opened', direction: 'flat', period: '' }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {SECTIONS.map((section) => {
          const lines = treasury.lines.filter((line) => line.purpose === section.purpose);

          return (
            <Panel key={section.purpose}>
              <PanelHeader title={section.title} subtitle={section.subtitle} />

              {lines.length === 0 ? (
                <p className="py-6 text-center text-xs text-fg-subtle">
                  {section.purpose === 'custody'
                    ? 'No customer balances yet.'
                    : section.purpose === 'payable'
                      ? 'Nothing waiting to be sent.'
                      : 'No fees earned yet.'}
                </p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {lines.map((line) => (
                    <TreasuryRow key={`${line.purpose}:${line.asset}`} line={line} />
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-4">
        <PanelHeader title="What is not here" subtitle="And why it would be a fiction" />
        <ul className="space-y-2.5 text-xs leading-relaxed text-fg-muted">
          <li>
            <span className="font-medium text-fg">Hot and cold wallets.</span> There is
            no chain client and no custody integration, so there are no addresses to
            show and no float to rebalance. A ratio against a ceiling would be two
            invented numbers divided by each other.
          </li>
          <li>
            <span className="font-medium text-fg">A reserve attestation.</span> Proving
            reserves means signing a message from an address that holds them. Nothing
            here holds an address.
          </li>
          <li>
            {/* Named because it is the gap that matters operationally: money sits in
                `payable` until something sends it, and nothing does. */}
            <span className="font-medium text-fg">A payout run.</span> Approving a
            withdrawal moves it to <span className="font-mono text-2xs">payable</span>{' '}
            and stops. Something with a hot wallet and a signing policy has to pick
            those up — that is the next real piece of this page, not a button on it.
          </li>
        </ul>
      </Panel>
    </>
  );
}

function TreasuryRow({ line }: { line: TreasuryLineDto }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-3">
      <span className="font-mono text-xs text-fg">{line.asset}</span>
      <span className="text-right">
        <span data-numeric className="block text-sm text-fg">
          {/* The magnitude, not the stored sign. `custody` is negative because that
              is what makes a transfer sum to zero, and "-14.2 BTC" under "owed to
              customers" invites exactly the wrong reading. */}
          {line.magnitude}
        </span>
        <span
          className={cn(
            'block text-2xs',
            line.valueUsd === null ? 'text-warn' : 'text-fg-subtle',
          )}
        >
          {line.valueUsd === null ? 'Not priced' : usd(line.valueUsd)}
        </span>
      </span>
    </li>
  );
}

