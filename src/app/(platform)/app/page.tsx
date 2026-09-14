import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  MailWarning,
  TriangleAlert,
  Wallet2,
} from 'lucide-react';

import { requireUser } from '@/server/auth';
import { getStatementFor, getWalletFor } from '@/server/ledger';
import { getMarkets } from '@/server/market-data';
import { formatDate, formatPercent } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Sparkline } from '@/shared/ui/visuals/sparkline';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../_console/components/table';
import { usd } from './_lib/format-usd';

/**
 * The signed-in overview.
 *
 * ── Three real sources, joined here ────────────────────────────────────────────
 * Holdings and their values come from the ledger and the price feed; recent
 * movements come from the ledger's entries; the market strip comes from
 * market-data. The page is the layer allowed to know all three exist.
 *
 * ── What it replaced, and what is honestly missing ─────────────────────────────
 * It used to read a fixture portfolio with an invented 30-day performance curve.
 * The curve is gone rather than recomputed: charting a portfolio over time needs
 * historical balance snapshots and historical prices, and this system stores
 * neither. Drawing one from today's prices would be a line that redraws itself
 * every page load and was never true at any point on it.
 *
 * What is here instead is what can be stated: what you hold, what it is worth
 * right now, and what has actually moved.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Overview',
  robots: { index: false, follow: false },
};

export default async function OverviewPage() {
  const user = await requireUser('/app');

  // Independent reads. `Promise.all` is safe here because each of these already
  // catches its own failures and resolves to a degraded value — none of them can
  // reject, so there is no unattached rejection to leak.
  const [wallet, statement, markets] = await Promise.all([
    getWalletFor(user.id as UserId),
    getStatementFor(user.id as UserId, { limit: 6 }),
    getMarkets({ limit: 5 }),
  ]);

  const marks = new Map(markets.map((m) => [m.symbol, m]));
  const held = wallet.balances.filter((balance) => Number(balance.total) > 0);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Signed in as ${user.email}.`}
      />

      {!user.emailVerified ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn/35 bg-warn/8 px-4 py-3"
        >
          <MailWarning className="size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm text-fg">
            Your email address has not been confirmed yet.
          </p>
          <Link href="/verify-email" className="text-xs font-medium text-warn hover:underline">
            Resend the link
          </Link>
        </div>
      ) : null}

      {wallet.degraded ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
          <p className="text-sm text-fg">
            Your balances could not be loaded.{' '}
            <span className="text-fg-muted">
              This is a failed query, not an empty account.
            </span>
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Portfolio value"
          value={wallet.totalValueUsd === null ? '—' : usd(wallet.totalValueUsd)}
          delta={{
            value:
              wallet.totalValueUsd === null
                ? 'some holdings are unpriced'
                : `${held.length} ${held.length === 1 ? 'asset' : 'assets'}`,
            direction: 'flat',
            period: '',
          }}
          icon={<Wallet2 className="size-4" />}
        />
        <StatTile
          label="Withdrawn today"
          value={usd(wallet.limits.usedUsd)}
          delta={{
            value: `${usd(wallet.limits.remainingUsd)} left`,
            direction: 'flat',
            period: 'today',
          }}
          upIsGood={false}
        />
        <StatTile
          label="Awaiting approval"
          value={String(wallet.pendingWithdrawals.length)}
          delta={{
            value:
              wallet.pendingWithdrawals.length === 0 ? 'nothing pending' : 'held, not spent',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
          icon={<Clock className="size-4" />}
        />
        <StatTile
          label="Movements"
          value={String(statement.total)}
          delta={{ value: 'on your statement', direction: 'flat', period: '' }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHeader
            title="Your holdings"
            subtitle="Valued at the live market, or left blank where it is not quoting"
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

          {held.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-subtle">
              {wallet.degraded
                ? 'Balances could not be read.'
                : 'No holdings yet. Deposits appear here once an operator confirms them.'}
            </p>
          ) : (
            <TableShell caption="Your holdings" minWidth="32rem">
              <thead>
                <tr>
                  <Th>Asset</Th>
                  <Th numeric>Balance</Th>
                  <Th numeric>24h</Th>
                  <Th numeric>Value</Th>
                </tr>
              </thead>
              <tbody>
                {held.map((balance) => {
                  const market = marks.get(balance.asset);
                  const quote = market?.quote.state === 'live' ? market.quote : null;

                  return (
                    <Tr key={balance.asset}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <AssetMark
                            symbol={balance.asset}
                            glyph={market?.glyph ?? balance.asset.slice(0, 1)}
                            hue={market?.hue ?? 'var(--chart-1)'}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-fg">{balance.asset}</span>
                            <span className="block text-2xs text-fg-subtle">{balance.name}</span>
                          </span>
                        </span>
                      </Td>
                      <Td numeric className="font-mono">
                        {balance.total}
                      </Td>
                      <Td numeric>
                        {quote === null ? (
                          <span className="text-2xs text-fg-subtle">—</span>
                        ) : (
                          <span
                            className={cn(
                              quote.change24hPercent >= 0 ? 'text-up' : 'text-down',
                            )}
                          >
                            {formatPercent(quote.change24hPercent)}
                          </span>
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
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Recent movements"
              subtitle="Straight from the ledger"
              actions={
                <Link
                  href="/app/transactions"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
                >
                  All
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            {statement.lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-subtle">
                Nothing has moved yet.
              </p>
            ) : (
              <ul className="divide-y divide-line/60">
                {statement.lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-3 py-3">
                    {line.direction === 'in' ? (
                      <ArrowDownLeft className="size-4 shrink-0 text-up" />
                    ) : (
                      <ArrowUpRight className="size-4 shrink-0 text-down" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm capitalize text-fg">
                        {line.kind.replace('-', ' ')}
                      </span>
                      <span className="block text-2xs text-fg-subtle">
                        {formatDate(line.occurredAt)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-sm',
                        line.direction === 'in' ? 'text-up' : 'text-fg',
                      )}
                    >
                      {line.delta} {line.asset}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Markets"
              subtitle="Live prices"
              actions={
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
                >
                  All
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            <ul className="divide-y divide-line/60">
              {markets.map((market) => (
                <li key={market.symbol} className="flex items-center gap-3 py-3">
                  <AssetMark
                    symbol={market.symbol}
                    glyph={market.glyph}
                    hue={market.hue}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {market.symbol}
                  </span>

                  {market.quote.state === 'unavailable' ? (
                    // Never a zero and never a dash pretending to be a price: the
                    // feed has not spoken, and the page says so.
                    <Badge tone="neutral">No price</Badge>
                  ) : (
                    <>
                      {market.quote.sparkline ? (
                        <Sparkline
                          id={`overview-${market.symbol}`}
                          data={market.quote.sparkline}
                          color={
                            market.quote.change24hPercent >= 0 ? 'var(--up)' : 'var(--down)'
                          }
                          width={56}
                          height={20}
                          filled={false}
                          strokeWidth={1.5}
                        />
                      ) : null}
                      <span className="shrink-0 text-sm tabular-nums text-fg">
                        {usd(market.quote.price)}
                      </span>
                      {market.quote.state === 'stale' ? (
                        <Badge tone="warn">Stale</Badge>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
