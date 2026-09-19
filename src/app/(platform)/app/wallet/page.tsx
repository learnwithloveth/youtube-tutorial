import type { Metadata } from 'next';
import { Clock, TriangleAlert, Wallet2 } from 'lucide-react';

import { requireUser } from '@/server/auth';
import { depositAddressesFor } from '@/server/deposit-addresses';
import { getDepositClaimsFor, getWalletFor, withdrawableAssets } from '@/server/ledger';
import { getInstruments } from '@/server/market-data';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { usd } from '../_lib/format-usd';
import { ReceiptLink } from '../_components/receipt-link';
import { networkLabelFor, networkLabels } from '../_lib/network-label';
import { CUSTOMER_STATUS } from '../_lib/record-status';
import { WithdrawForm } from './_components/withdraw-form';
import { shortenDecimalString } from '@/shared/kernel';

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
 * Deposit addresses for every asset-network pair we custody.
 *
 * Keyed `ASSET:NETWORK` because the pair is what identifies an address: USDT on
 * Ethereum and USDT on Tron are different chains and not interchangeable. Resolved
 * on the server, so an address is never assembled in the browser.
 */
function depositAddresses(
  assets: readonly { code: string; networks: readonly { id: string }[] }[],
): Record<string, { address: string; demo: boolean }> {
  const found: Record<string, { address: string; demo: boolean }> = {};

  for (const asset of assets) {
    const byNetwork = depositAddressesFor(
      asset.code,
      asset.networks.map((network) => network.id),
    );

    for (const [network, entry] of Object.entries(byNetwork)) {
      found[`${asset.code}:${network}`] = { address: entry.address, demo: entry.demo };
    }
  }

  return found;
}

export default async function WalletPage() {
  const user = await requireUser('/app/wallet');

  /*
   * Awaited together, not one after the other.
   *
   * The glyph and brand hue are editorial and belong to market-data, not to the
   * ledger — a storage precision and a brand colour have no business in the same
   * catalogue. The page is the layer allowed to know both, so the join is here.
   *
   * The catalogue read does not depend on the wallet; it was simply written second
   * and inherited its turn. Each of these is one round trip to a database in
   * another region, so running them in series cost the page a whole extra one for
   * no reason. Neither rejects — both degrade to an empty result — so there is no
   * unattached rejection to leak.
   */
  const [claims, wallet, instruments] = await Promise.all([
    // The customer's own side of the deposit flow. Read here for the first time:
    // `getDepositClaimsFor` has existed since claims did and nothing rendered it,
    // so somebody who reported a deposit could see it only as a notification that
    // scrolled away. That gap is what made "confirming" worth adding a state for —
    // a wait nobody can look at is indistinguishable from nothing happening.
    getDepositClaimsFor(user.id as UserId),
    getWalletFor(user.id as UserId),
    getInstruments(),
  ]);
  const marks = new Map(instruments.map((i) => [i.symbol, { glyph: i.glyph, hue: i.hue }]));

  /*
   * Only what is still going on, plus anything refused.
   *
   * An approved claim is not dropped because it is uninteresting — it is dropped
   * because it is already on the balances table below and in the statement, and
   * listing it a third time would have the same deposit appear to have happened
   * repeatedly. A rejection stays: nothing else on this page records it, and the
   * reason is the whole point of having refused in words.
   */
  const open = claims.filter((claim) => claim.status !== 'approved');

  const assets = withdrawableAssets();
  // "Tron (TRC-20)", not "tron". The token standard is the part somebody has to
  // get right when they check an address against what they pasted.
  const labels = networkLabels(assets);
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
            depositAddresses={depositAddresses(assets)}
          />
        </Panel>

        {/* `min-w-0` is load-bearing: the balances table below carries a
            `min-width` so its columns stay readable, and without this the grid
            column grows to fit it — which on a phone meant the whole page scrolled
            sideways by 200px instead of the table scrolling inside its own box. */}
        <div className="min-w-0 space-y-4">
        

          {open.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Deposits you have reported"
                subtitle="Pending until an operator has matched it to the transaction on the chain"
              />
              <ul className="divide-y divide-line/60">
                {open.map((claim) => (
                  <li key={claim.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* The coin carrying its chain's badge, in place of the clock
                          that used to sit here. The status is already spelled out
                          in words on the badge at the end of this row, and what the
                          glyph was doing — saying "not finished yet" a second time —
                          is worth less than saying *which USDT this is*. */}
                      <AssetMark
                        symbol={claim.asset}
                        glyph={marks.get(claim.asset)?.glyph ?? claim.asset.slice(0, 1)}
                        hue={marks.get(claim.asset)?.hue ?? 'var(--chart-1)'}
                        network={claim.network}
                        size="xs"
                      />
                      <span className="font-mono text-sm text-fg">
                        {shortenDecimalString(claim.claimedAmount)} {claim.asset}
                      </span>
                      <span className="text-2xs text-fg-subtle">
                        {networkLabelFor(labels, claim.asset, claim.network)}
                      </span>
                      <span className="ml-auto text-2xs text-fg-subtle">
                        {formatDate(claim.submittedAt)}
                      </span>
                      {/* The same three words this account's other screens use.
                          This panel used to say "Reported" where the transactions
                          page said "Awaiting review" about the very same row. */}
                      <Badge tone={CUSTOMER_STATUS[claim.status].tone}>
                        {CUSTOMER_STATUS[claim.status].label}
                      </Badge>
                      <ReceiptLink
                        kind="deposit"
                        recordId={claim.id}
                        status={claim.status === 'confirming' ? 'confirming' : claim.status}
                      />
                    </div>
                    {/* The operator's own words, whichever kind they are. A note
                        while it confirms and a reason for a refusal are different
                        fields on the record precisely so this line cannot present
                        one as the other. */}
                    {claim.status === 'confirming' ? (
                      <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
                        {claim.confirmingNote ?? CUSTOMER_STATUS.confirming.hint}
                      </p>
                    ) : null}
                    {claim.status === 'pending' ? (
                      <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
                        {CUSTOMER_STATUS.pending.hint}
                      </p>
                    ) : null}
                    {claim.reason !== null && claim.status === 'rejected' ? (
                      <p className="mt-1.5 text-2xs leading-relaxed text-down">
                        {claim.reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
                A transaction is spendable once it has enough confirmations on its
                network and an operator has matched it to your report. Until then it
                is not part of your balance.
              </p>
            </Panel>
          ) : null}

          {wallet.pendingWithdrawals.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Awaiting approval"
                subtitle="These amounts are held on your balance until an operator decides"
              />
              <ul className="divide-y divide-line/60">
                {wallet.pendingWithdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="flex flex-wrap items-center gap-3 py-3">
                    {/* Which chain this is leaving on is the single most consequential
                        fact on the row: USDT sent over Tron to an Ethereum address is
                        gone. It was rendering as the raw id next to a generic clock. */}
                    <AssetMark
                      symbol={withdrawal.asset}
                      glyph={marks.get(withdrawal.asset)?.glyph ?? withdrawal.asset.slice(0, 1)}
                      hue={marks.get(withdrawal.asset)?.hue ?? 'var(--chart-1)'}
                      network={withdrawal.network}
                      size="xs"
                    />
                    <span className="font-mono text-sm text-fg">
                      {shortenDecimalString(withdrawal.amount)} {withdrawal.asset}
                    </span>
                    <span className="text-2xs text-fg-subtle">
                      {networkLabelFor(labels, withdrawal.asset, withdrawal.network)} · to{' '}
                      <span className="font-mono">{withdrawal.destination}</span>
                    </span>
                    <span className="ml-auto text-2xs text-fg-subtle">
                      {formatDate(withdrawal.requestedAt)}
                    </span>
                    <Badge tone="warn">
                      {withdrawal.approvalsRequired > 1
                        ? `${withdrawal.approvalsHeld}/${withdrawal.approvalsRequired} approvals`
                        : 'Pending'}
                    </Badge>
                    {/* Every one of these is still pending, so the link reads
                        "View" rather than "Receipt" — the document it opens heads
                        itself "Transaction pending" and says it is not one. */}
                    <ReceiptLink
                      kind="withdrawal"
                      recordId={withdrawal.id}
                      status="pending"
                    />
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
                        {/* Shortened for the same reason the withdrawal form is:
                            an 18-decimal asset fills the column with zeros. */}
                        {shortenDecimalString(balance.available)}
                      </Td>
                      <Td numeric className="font-mono">
                        {balance.held === '0' || Number(balance.held) === 0 ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          shortenDecimalString(balance.held)
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


/**
 * How a reported deposit reads on the customer's own page.
 *
 * Four states rather than three, and the extra one is the point: `pending` means
 * nobody has looked yet, `confirming` means somebody has and the network is what
 * is being waited on. Before that distinction existed a customer watching
 * "Reported" for an hour had no way to tell a slow queue from a slow chain, and
 * those want completely different responses from them — chase us, or wait.
 */
