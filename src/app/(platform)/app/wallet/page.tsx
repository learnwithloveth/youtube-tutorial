import type { Metadata } from 'next';
import { Clock, TriangleAlert, Wallet2 } from 'lucide-react';

import { requireUser } from '@/server/auth';
import { getWalletFor, withdrawableAssets } from '@/server/ledger';
import { getInstruments } from '@/server/market-data';
import { formatClock, formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { usd } from '../_lib/format-usd';
import { WithdrawForm } from './_components/withdraw-form';

/**
 * The wallet.
 *
 * ── Server reads, one client island ────────────────────────────────────────────
 * Balances, limits and pending withdrawals are read here, on the server, from the
 * ledger. The only interactive part is the deposit/withdraw panel, which is a leaf
 * — so the balance table and the limit meters ship as HTML rather than as JSON plus
 * the code to render it.
 *
 * ── Every figure is an exact decimal string ────────────────────────────────────
 * Nothing on this page is a JavaScript number. Amounts arrive from the ledger as
 * strings and are formatted as strings, which is the money rule carried to the last
 * layer: a `Number()` here would undo, at the point of render, every precaution
 * taken beneath it.
 *
 * ── `force-dynamic`, deliberately ──────────────────────────────────────────────
 * A cached balance is a wrong balance. ISR would also serve one customer's holdings
 * to whoever asked next, which on this page is the worst possible bug.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wallet',
  robots: { index: false, follow: false },
};

/**
 * Platform deposit addresses.
 *
 * Read from configuration rather than hard-coded, and absent by default. An address
 * that is not ours is a customer's funds sent nowhere, so the panel shows a warning
 * rather than a plausible-looking string when none is set.
 */
function depositAddresses(): Record<string, string> {
  const configured: Record<string, string | undefined> = {
    BTC: process.env.DEPOSIT_ADDRESS_BTC,
    ETH: process.env.DEPOSIT_ADDRESS_ETH,
    USDC: process.env.DEPOSIT_ADDRESS_USDC,
    SOL: process.env.DEPOSIT_ADDRESS_SOL,
  };

  return Object.fromEntries(
    Object.entries(configured).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
}

export default async function WalletPage() {
  const user = await requireUser('/app/wallet');
  const wallet = await getWalletFor(user.id as UserId);

  // The glyph and brand hue are editorial and belong to market-data, not to the
  // ledger — a storage precision and a brand colour have no business in the same
  // catalogue. The page is the layer allowed to know both, so the join is here.
  const instruments = await getInstruments();
  const marks = new Map(instruments.map((i) => [i.symbol, { glyph: i.glyph, hue: i.hue }]));

  const assets = withdrawableAssets();
  // Counting rows for a caption, not summing money — the one place a coercion is
  // harmless, because the result never becomes a figure anyone reads.
  const held = wallet.balances.filter((balance) => Number(balance.held) > 0);

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Move money in and out. Every withdrawal is reviewed before it leaves; deposits are credited once confirmed."
      />

      {wallet.degraded ? (
        <Notice
          tone="down"
          title="Your balances could not be loaded."
          body="This is a failed query, not an empty account. Nothing below should be read as a statement about your holdings."
        />
      ) : null}

      {wallet.valuationIncomplete && !wallet.degraded && wallet.balances.length > 0 ? (
        <Notice
          tone="warn"
          title="Some holdings could not be priced."
          body="Your balances are exact; their dollar values are not shown where the market is not quoting. Withdrawals of those assets are paused until pricing returns."
        />
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total balance"
          value={wallet.totalValueUsd === null ? '—' : usd(wallet.totalValueUsd)}
          delta={{
            value: wallet.totalValueUsd === null ? 'pricing unavailable' : 'across all assets',
            direction: 'flat',
            period: '',
          }}
          icon={<Wallet2 className="size-4" />}
        />
        <StatTile
          label="Assets held"
          value={String(wallet.balances.length)}
          delta={{
            value: held.length > 0 ? `${held.length} with funds on hold` : 'none on hold',
            direction: 'flat',
            period: '',
          }}
        />
        <StatTile
          label="Withdrawn today"
          value={usd(wallet.limits.usedUsd)}
          delta={{
            value: `${usd(wallet.limits.remainingUsd)} left`,
            direction: 'flat',
            period: `of ${usd(wallet.limits.capUsd)}`,
          }}
          upIsGood={false}
        />
        <StatTile
          label="Awaiting approval"
          value={String(wallet.pendingWithdrawals.length)}
          delta={{
            value: wallet.pendingWithdrawals.length === 0 ? 'nothing pending' : 'held, not spent',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
          icon={<Clock className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_1.25fr]">
        <Panel>
          <WithdrawForm
            assets={assets}
            balances={wallet.balances}
            depositAddresses={depositAddresses()}
          />
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Daily limits"
              subtitle={`${wallet.limits.tier} tier · resets ${formatClock(wallet.limits.resetsAt)} UTC`}
            />
            <LimitBar
              label="Withdrawals today"
              used={wallet.limits.usedUsd}
              cap={wallet.limits.capUsd}
            />
            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
              The limit is measured in dollars rather than per asset, so it cannot be
              sidestepped by withdrawing something else. It resets at midnight UTC —
              one instant for everyone, not one per timezone.
            </p>
          </Panel>

          {wallet.pendingWithdrawals.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Awaiting approval"
                subtitle="These amounts are held on your balance until an operator decides"
              />
              <ul className="divide-y divide-line/60">
                {wallet.pendingWithdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Clock className="size-4 shrink-0 text-warn" />
                    <span className="font-mono text-sm text-fg">
                      {withdrawal.amount} {withdrawal.asset}
                    </span>
                    <span className="text-2xs text-fg-subtle">
                      to {withdrawal.destination} · {withdrawal.network}
                    </span>
                    <span className="ml-auto text-2xs text-fg-subtle">
                      {formatDate(withdrawal.requestedAt)}
                    </span>
                    <Badge tone="warn">
                      {withdrawal.approvalsRequired > 1
                        ? `${withdrawal.approvalsHeld}/${withdrawal.approvalsRequired} approvals`
                        : 'Pending'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Balances" subtitle="Held on the exchange" />
            <TableShell caption="Your balances" minWidth="34rem">
              <thead>
                <tr>
                  <Th>Asset</Th>
                  <Th numeric>Available</Th>
                  <Th numeric>On hold</Th>
                  <Th numeric>Value</Th>
                </tr>
              </thead>
              <tbody>
                {wallet.balances.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-14 text-center text-sm text-fg-subtle">
                      {wallet.degraded
                        ? 'Balances could not be read.'
                        : 'No balances yet. Deposits appear here once credited.'}
                    </td>
                  </tr>
                ) : (
                  wallet.balances.map((balance) => (
                    <Tr key={balance.asset}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <AssetMark
                            symbol={balance.asset}
                            glyph={marks.get(balance.asset)?.glyph ?? balance.asset.slice(0, 1)}
                            hue={marks.get(balance.asset)?.hue ?? 'var(--chart-1)'}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-fg">{balance.asset}</span>
                            <span className="block text-2xs text-fg-subtle">{balance.name}</span>
                          </span>
                        </span>
                      </Td>
                      <Td numeric className="font-mono">
                        {balance.available}
                      </Td>
                      <Td numeric className="font-mono">
                        {balance.held === '0' || Number(balance.held) === 0 ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          balance.held
                        )}
                      </Td>
                      <Td numeric>
                        {balance.valueUsd === null ? (
                          <span className="text-2xs text-fg-subtle">Not priced</span>
                        ) : (
                          usd(balance.valueUsd)
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </Panel>
        </div>
      </div>
    </>
  );
}


function LimitBar({ label, used, cap }: { label: string; used: string; cap: string }) {
  // Percentages are for a bar's width, which is a rendering concern rather than an
  // accounting one — this is the one place a number is acceptable, and it never
  // feeds back into a figure anyone reads.
  const pct = Number(cap) > 0 ? Math.min(100, (Number(used) / Number(cap)) * 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums text-fg">
          {usd(used)} <span className="text-fg-subtle">/ {usd(cap)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            pct > 80 ? 'bg-warn' : 'bg-[var(--chart-1)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Notice({ tone, title, body }: { tone: 'warn' | 'down'; title: string; body: string }) {
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-start gap-3 rounded-lg border px-4 py-3',
        tone === 'down' ? 'border-down/35 bg-down/8' : 'border-warn/35 bg-warn/8',
      )}
    >
      <TriangleAlert
        className={cn('mt-0.5 size-4 shrink-0', tone === 'down' ? 'text-down' : 'text-warn')}
      />
      <p className="min-w-0 text-sm text-fg">
        {title} <span className="text-fg-muted">{body}</span>
      </p>
    </div>
  );
}
