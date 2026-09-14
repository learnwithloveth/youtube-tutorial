import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Info, Landmark, Percent, TrendingUp } from 'lucide-react';

import { requireUser } from '@/server/auth';
import { getWalletFor } from '@/server/ledger';
import { getInstruments, getYields } from '@/server/market-data';
import { formatCompact } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { usd } from '../_lib/format-usd';

/**
 * Earn — observed staking rates.
 *
 * ── What is real, and what this page is careful not to claim ───────────────────
 * Every rate here is observed: DefiLlama's public yields index, filtered to
 * single-sided pools with no impermanent loss above a size floor, largest pool per
 * asset. Each row names the protocol, the chain and the value staked, because "ETH
 * earns 2.2%" is not a fact about ether — it is a fact about Lido on Ethereum this
 * week, and a number without that attribution is not checkable.
 *
 * What the page does **not** do is offer to stake anything. This platform has no
 * staking context: no lock, no accrual, no unbonding period. The fixture it
 * replaced showed positions, rewards and a claim button for all three, which is
 * the most expensive kind of lie a financial product can tell — one that looks
 * like an account balance.
 *
 * So the rates are shown, the customer's own holding is shown next to each, and
 * the page says plainly that staking is not live. When a staking context exists,
 * the rates on this page are what it will quote.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Earn',
  robots: { index: false, follow: false },
};

export default async function EarnPage() {
  const user = await requireUser('/app/earn');

  const [yields, wallet, instruments] = await Promise.all([
    getYields(),
    getWalletFor(user.id as UserId),
    getInstruments(),
  ]);

  const marks = new Map(instruments.map((i) => [i.symbol, i]));
  const balances = new Map(wallet.balances.map((b) => [b.asset, b]));

  const best = yields[0];
  // Only counts assets the customer actually holds — an average across rates they
  // cannot access would be a number about the market, labelled as being about them.
  const held = yields.filter((entry) => balances.has(entry.symbol));

  return (
    <>
      <PageHeader
        title="Earn"
        description="Staking rates observed across the protocols that hold the stake. Each row names where the number came from."
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-bg-elev/70 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-soft" />
        <p className="min-w-0 text-sm text-fg">
          Staking is not live on this platform yet.{' '}
          <span className="text-fg-muted">
            These are the rates available in the market today, not positions you
            hold. Nothing here is locked, accruing, or claimable.
          </span>
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Best observed rate"
          value={best ? `${best.apyPercent.toFixed(2)}%` : '—'}
          delta={{
            value: best ? `${best.symbol} via ${best.protocol}` : 'no rates available',
            direction: 'flat',
            period: '',
          }}
          icon={<Percent className="size-4" />}
        />
        <StatTile
          label="Rates tracked"
          value={String(yields.length)}
          delta={{ value: 'assets we list', direction: 'flat', period: '' }}
          icon={<TrendingUp className="size-4" />}
        />
        <StatTile
          label="On assets you hold"
          value={String(held.length)}
          delta={{
            value: held.length === 0 ? 'nothing held yet' : 'of your balances',
            direction: 'flat',
            period: '',
          }}
          icon={<Landmark className="size-4" />}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Observed rates"
          subtitle="Largest single-sided pool per asset, refreshed hourly"
          actions={
            <Link
              href="/app/wallet"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
            >
              Wallet
              <ArrowRight className="size-3" />
            </Link>
          }
        />

        <TableShell caption="Observed staking rates" minWidth="52rem">
          <thead>
            <tr>
              <Th>Asset</Th>
              <Th numeric>APY</Th>
              <Th>Where</Th>
              <Th numeric>Pool size</Th>
              <Th numeric>You hold</Th>
            </tr>
          </thead>
          <tbody>
            {yields.length === 0 ? (
              <EmptyRow colSpan={5}>
                Rates could not be read right now. This is a failed lookup, not a
                market paying nothing.
              </EmptyRow>
            ) : (
              yields.map((entry) => {
                const mark = marks.get(entry.symbol);
                const balance = balances.get(entry.symbol);

                return (
                  <Tr key={`${entry.symbol}-${entry.protocol}`}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <AssetMark
                          symbol={entry.symbol}
                          glyph={mark?.glyph ?? entry.symbol.slice(0, 1)}
                          hue={mark?.hue ?? 'var(--chart-1)'}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-fg">{entry.symbol}</span>
                          <span className="block text-2xs text-fg-subtle">
                            {mark?.name ?? entry.symbol}
                          </span>
                        </span>
                      </span>
                    </Td>

                    <Td numeric>
                      <span className="font-sans text-base font-semibold text-fg">
                        {entry.apyPercent.toFixed(2)}%
                      </span>
                      {entry.rewardApyPercent !== null && entry.rewardApyPercent > 0.01 ? (
                        <span className="mt-0.5 block text-2xs text-fg-subtle">
                          incl. {entry.rewardApyPercent.toFixed(2)}% incentives
                        </span>
                      ) : null}
                    </Td>

                    <Td>
                      <span className="block text-xs text-fg">{entry.protocol}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-fg-subtle">
                        {entry.chain}
                        {entry.poolSymbol !== entry.symbol ? (
                          <Badge tone="neutral">{entry.poolSymbol}</Badge>
                        ) : null}
                      </span>
                    </Td>

                    <Td numeric>{formatCompact(entry.tvlUsd, 'USD')}</Td>

                    <Td numeric>
                      {balance === undefined ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        <>
                          <span className="block font-mono text-xs text-fg">
                            {balance.total}
                          </span>
                          {balance.valueUsd !== null ? (
                            <span className="block text-2xs text-fg-subtle">
                              {usd(balance.valueUsd)}
                            </span>
                          ) : null}
                        </>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </TableShell>

        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
          Bitcoin shows close to nothing because it has no native staking — any
          non-zero BTC rate is a lending or wrapped-asset product carrying
          counterparty risk that proof-of-stake rewards do not. Rates are the
          largest single-sided pool per asset with no impermanent loss, which is a
          judgement about comparability, not a recommendation.
        </p>
      </Panel>
    </>
  );
}
