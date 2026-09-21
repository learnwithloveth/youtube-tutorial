import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  PieChart,
  TriangleAlert,
  Wallet2,
} from 'lucide-react';

import { shortenHash } from '@/modules/ledger';
import { requireUser } from '@/server/auth';
import { getStatementFor, getWalletFor } from '@/server/ledger';
import { getMarkets } from '@/server/market-data';
import { shortenDecimalString } from '@/shared/kernel';
import { formatDate, formatPercent } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { StatTile } from '@/shared/ui/charts/stat-tile';
import { Sparkline } from '@/shared/ui/visuals/sparkline';
import type { DonutSlice } from '@/shared/ui/charts/donut-chart';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { UserId } from '@/shared/kernel/ids';

import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { assetDisplayMap, unknownAsset } from '../_lib/asset-display';
import { usd } from '../_lib/format-usd';
import { AllocationDonut } from './_components/allocation-donut';

/**
 * The portfolio: what is held, and how it is distributed.
 *
 * ── There is no performance chart, and that is the honest answer ───────────────
 * The page this replaced drew a 30-day portfolio curve from a fixture. Recomputing
 * it needs two things this system does not store: a snapshot of what was held on
 * each past day, and the price of each asset on that day. A curve drawn from
 * today's prices and today's balances is not history — it is one number repeated,
 * and it would redraw itself differently on every page load.
 *
 * Building it properly means a daily valuation job writing a snapshot per account
 * per day. That is a real feature with a real cost, and a chart that looks like it
 * already exists is the worst way to decide whether to pay it.
 *
 * ── Allocation is computable, and is here ──────────────────────────────────────
 * "What fraction of my portfolio is bitcoin" needs only current balances and
 * current prices, both of which are real. It is shown, with the unpriceable
 * holdings called out rather than folded in at zero.
 *
 * ── What arrived from the overview ─────────────────────────────────────────────
 * The recent-movements list and the market strip used to sit on `/app`, beside a
 * holdings table that duplicated the one below. The overview is now a balance and
 * a token list — see that page — and the detail lives here, on the screen somebody
 * opens *in order to* read detail. The holdings table was the duplicate, and only
 * this copy survives.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Portfolio',
  robots: { index: false, follow: false },
};

export default async function PortfolioPage() {
  const user = await requireUser('/app/portfolio');

  const [wallet, markets, statement] = await Promise.all([
    getWalletFor(user.id as UserId),
    getMarkets(),
    getStatementFor(user.id as UserId, { limit: 8 }),
  ]);

  const marks = new Map(markets.map((m) => [m.symbol, m]));
  /* Ledger code → how to print it and which market prices it. Two tether assets
     share one market, so the code is no longer a market symbol — see the module. */
  const display = assetDisplayMap();
  const held = wallet.balances.filter((balance) => Number(balance.total) > 0);

  const priced = held.filter((balance) => balance.valueUsd !== null);
  const unpriced = held.filter((balance) => balance.valueUsd === null);

  // Shares are computed over the priced subset only, and the page says so. Folding
  // an unpriceable holding in at zero would silently overstate everything else.
  const pricedTotal = priced.reduce((sum, balance) => sum + Number(balance.valueUsd), 0);

  const slices: DonutSlice[] = priced.map((balance) => ({
    key: balance.asset,
    /* `USDT · ethereum`, never a bare `USDT`: two slices sharing one label would
       read as one position split in half rather than as two separate holdings. */
    label: balance.network === null ? balance.ticker : `${balance.ticker} · ${balance.network}`,
    value: Number(balance.valueUsd),
    share: pricedTotal > 0 ? Number(balance.valueUsd) / pricedTotal : 0,
  }));

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="What you hold and how it is distributed, valued at the live market."
      />

      {wallet.degraded ? (
        <Notice
          title="Your portfolio could not be loaded."
          body="This is a failed query, not an empty account."
        />
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Portfolio value"
          value={wallet.totalValueUsd === null ? '—' : usd(wallet.totalValueUsd)}
          delta={{
            value:
              wallet.totalValueUsd === null
                ? `${unpriced.length} unpriced`
                : 'valued now',
            direction: 'flat',
            period: '',
          }}
          icon={<Wallet2 className="size-4" />}
        />
        <StatTile
          label="Assets held"
          value={String(held.length)}
          delta={{
            value: `${priced.length} priced`,
            direction: 'flat',
            period: '',
          }}
          icon={<PieChart className="size-4" />}
        />
        <StatTile
          label="Largest position"
          value={slices[0]?.label ?? '—'}
          delta={{
            value:
              slices[0] === undefined
                ? 'nothing held'
                : `${(slices[0].share * 100).toFixed(1)}% of priced value`,
            direction: 'flat',
            period: '',
          }}
        />
        {/* Moved from the overview with the panels below. `upIsGood={false}`
            because a queue of withdrawals waiting on an operator is not an
            achievement — the tile must not go green as it grows. */}
        <StatTile
          label="Awaiting approval"
          value={String(wallet.pendingWithdrawals.length)}
          delta={{
            value:
              wallet.pendingWithdrawals.length === 0 ? 'nothing pending' : 'held, not moved',
            direction: 'flat',
            period: '',
          }}
          upIsGood={false}
          icon={<Clock className="size-4" />}
        />
      </div>

      {held.length === 0 ? (
        <Panel>
          <p className="py-14 text-center text-sm text-fg-subtle">
            {wallet.degraded
              ? 'Balances could not be read.'
              : 'Nothing held yet. Deposits appear here once an operator confirms them.'}{' '}
            <Link href="/app/wallet" className="text-brand-soft hover:underline">
              Open the wallet
            </Link>
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_1.4fr]">
          <Panel>
            <PanelHeader
              title="Allocation"
              subtitle={
                unpriced.length > 0
                  ? `Of the ${priced.length} holdings we can price — ${unpriced.length} excluded`
                  : 'By current market value'
              }
            />
            {slices.length === 0 ? (
              <p className="py-10 text-center text-sm text-fg-subtle">
                Nothing here can be priced right now, so there is no share to show.
              </p>
            ) : (
              <div className="flex justify-center">
                {/* Wrapped, because `formatValue` is a function and this page is
                    a Server Component — see `allocation-donut.tsx`. */}
                <AllocationDonut
                  slices={slices}
                  centerValue={usd(pricedTotal.toFixed(2))}
                />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Holdings"
              subtitle="Balances are exact; values follow the live market"
              actions={
                <Link
                  href="/app/transactions"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
                >
                  Statement
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            <TableShell caption="Your holdings" minWidth="40rem">
              <thead>
                <tr>
                  <Th>Asset</Th>
                  <Th numeric>Balance</Th>
                  <Th numeric>Price</Th>
                  <Th numeric>24h</Th>
                  <Th numeric>Value</Th>
                  <Th numeric>Share</Th>
                </tr>
              </thead>
              <tbody>
                {held.map((balance) => {
                  const shown = display.get(balance.asset) ?? unknownAsset(balance.asset);
                  const market = marks.get(shown.quoteSymbol);
                  const quote = market?.quote.state === 'live' ? market.quote : null;
                  const share =
                    balance.valueUsd !== null && pricedTotal > 0
                      ? Number(balance.valueUsd) / pricedTotal
                      : null;

                  return (
                    <Tr key={balance.asset}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <AssetMark
                            symbol={balance.asset}
                            glyph={market?.glyph ?? balance.ticker.slice(0, 1)}
                            hue={market?.hue ?? 'var(--chart-1)'}
                            network={balance.network}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-fg">{balance.ticker}</span>
                            <span className="block text-2xs text-fg-subtle">
                              {balance.name}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td numeric className="font-mono">
                        {balance.total}
                      </Td>
                      <Td numeric>
                        {quote === null ? (
                          <Badge tone="neutral">No price</Badge>
                        ) : (
                          usd(quote.price)
                        )}
                      </Td>
                      <Td numeric>
                        {quote === null ? (
                          <span className="text-fg-subtle">—</span>
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
                      <Td numeric>
                        {share === null ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          `${(share * 100).toFixed(1)}%`
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableShell>

            {unpriced.length > 0 ? (
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
                {unpriced.map((balance) => balance.name).join(', ')}{' '}
                {unpriced.length === 1 ? 'has' : 'have'} no live quote, so{' '}
                {unpriced.length === 1 ? 'it is' : 'they are'} excluded from the total
                and the shares rather than counted as zero.
              </p>
            ) : null}
          </Panel>
        </div>
      )}

      {/* ── Arrived from the overview ──────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Recent movements"
            subtitle={`Straight from the ledger · ${statement.total} in total`}
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
            <p className="py-8 text-center text-sm text-fg-subtle">Nothing has moved yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {statement.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3 py-3">
                  {/* The coin, carrying its chain's badge where the two differ.
                      On a list where half the rows are USDT, which chain a
                      movement was on is the thing a reader is looking for, and an
                      arrow says nothing about it. */}
                  <AssetMark
                    symbol={line.asset}
                    glyph={
                      marks.get(display.get(line.asset)?.quoteSymbol ?? line.asset)?.glyph ??
                      line.asset.slice(0, 1)
                    }
                    hue={
                      marks.get(display.get(line.asset)?.quoteSymbol ?? line.asset)?.hue ??
                      'var(--chart-1)'
                    }
                    network={line.network}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm capitalize text-fg">
                      {line.kind.replace('-', ' ')}
                    </span>
                    <span className="block truncate text-2xs text-fg-subtle">
                      {formatDate(line.occurredAt)}
                      {line.txHash === null ? null : (
                        <>
                          {' · '}
                          <span className="font-mono">{shortenHash(line.txHash, 6, 4)}</span>
                        </>
                      )}
                    </span>
                  </span>
                  {line.direction === 'in' ? (
                    <ArrowDownLeft className="size-3.5 shrink-0 text-up" />
                  ) : (
                    <ArrowUpRight className="size-3.5 shrink-0 text-down" />
                  )}
                  <span
                    className={cn(
                      'shrink-0 font-mono text-sm',
                      line.direction === 'in' ? 'text-up' : 'text-fg',
                    )}
                  >
                    {shortenDecimalString(line.delta)}{' '}
                    {display.get(line.asset)?.ticker ?? line.asset}
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
            {markets.slice(0, 6).map((market) => (
              <li key={market.symbol} className="flex items-center gap-3 py-3">
                <AssetMark
                  symbol={market.symbol}
                  glyph={market.glyph}
                  hue={market.hue}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{market.symbol}</span>

                {market.quote.state === 'unavailable' ? (
                  // Never a zero and never a dash pretending to be a price: the
                  // feed has not spoken, and the row says so.
                  <Badge tone="neutral">No price</Badge>
                ) : (
                  <>
                    {market.quote.sparkline ? (
                      <Sparkline
                        id={`portfolio-${market.symbol}`}
                        data={market.quote.sparkline}
                        color={market.quote.change24hPercent >= 0 ? 'var(--up)' : 'var(--down)'}
                        width={56}
                        height={20}
                        filled={false}
                        strokeWidth={1.5}
                      />
                    ) : null}
                    <span className="shrink-0 text-sm tabular-nums text-fg">
                      {usd(market.quote.price)}
                    </span>
                    {market.quote.state === 'stale' ? <Badge tone="warn">Stale</Badge> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-down/35 bg-down/8 px-4 py-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
      <p className="min-w-0 text-sm text-fg">
        {title} <span className="text-fg-muted">{body}</span>
      </p>
    </div>
  );
}
