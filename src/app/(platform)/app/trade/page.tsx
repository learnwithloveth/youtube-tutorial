'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr, EmptyRow } from '../../../_console/components/table';
import { ChartFrame } from '@/shared/ui/charts/chart-frame';
import { CandleChart } from '@/shared/ui/charts/candle-chart';
import { DepthChart } from '@/shared/ui/charts/depth-chart';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { Badge } from '@/shared/ui/primitives/badge';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { OrderBook } from '../../_components/order-book';
import { OrderForm } from '../../_components/order-form';
import { ASSETS, ASSET_BY_ID, FIRST_ASSET } from '../../../_console/data/assets';
import { useLiveQuotes } from '../../_data/use-markets';
import { AVAILABLE_CASH, OPEN_ORDERS, RECENT_FILLS, buildBook, buildCandles } from '../../_data/data';
import { dayLabel, dateTimeLabel, fullDayLabel, money, moneyExact } from '../../../_console/data/format';
import { formatCompact, formatPercent, formatQuantity } from '@/shared/lib/format';
import { useEscape, useOutsideClick } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/cn';
import { useRef } from 'react';

const MARKETS = ASSETS.slice(0, 10).filter((a) => a.category !== 'Stablecoin');
type Tab = 'orders' | 'fills';

export default function TradeTerminalPage() {

  const [assetId, setAssetId] = useState('btc');
  const [picker, setPicker] = useState(false);
  const [tab, setTab] = useState<Tab>('orders');
  const pickerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(pickerRef, () => setPicker(false), picker);
  useEscape(() => setPicker(false), picker);

  // ASSETS is a non-empty literal catalogue; the fallback keeps the compiler
  // honest without an assertion, and the throw is unreachable in practice.
  const asset = ASSET_BY_ID.get(assetId) ?? FIRST_ASSET;
  const quotes = useLiveQuotes([asset]);
  const live = quotes[0]?.live ?? asset.price;
  const [limitPrice, setLimitPrice] = useState(asset.price);

  const market = `${asset.symbol}-USD`;
  const candles = useMemo(() => buildCandles(asset.symbol), [asset.symbol]);
  const book = useMemo(() => buildBook(asset.price), [asset.price]);

  const priceFmt = (v: number) =>
    v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : v.toFixed(v >= 1 ? 3 : 5);

  const up = asset.change24h >= 0;
  const orders = OPEN_ORDERS;

  return (
    <>
      <PageHeader
        title="Trade"
        description="The same order book institutions trade on, with the maker rate your tier earns."
      />

      {/* Market header — price, session stats, pair selector. */}
      <Panel className="mb-4" padded={false}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-4">
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              aria-expanded={picker}
              aria-haspopup="listbox"
              className="flex items-center gap-3 rounded-md border border-line px-3 py-2 transition-colors hover:border-line-strong"
            >
              <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} size="sm" />
              <span className="text-left">
                <span className="block text-sm font-semibold text-fg">{market}</span>
                <span className="block text-2xs text-fg-subtle">{asset.name}</span>
              </span>
              <ChevronDown className={cn('size-4 text-fg-subtle transition-transform', picker && 'rotate-180')} />
            </button>
            {picker ? (
              <ul
                role="listbox"
                aria-label="Select market"
                className="absolute left-0 top-full z-30 mt-2 max-h-72 w-64 overflow-y-auto rounded-lg border border-line bg-bg-elev/98 p-1.5 shadow-float backdrop-blur-2xl"
              >
                {MARKETS.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={m.id === assetId}
                      onClick={() => {
                        setAssetId(m.id);
                        setLimitPrice(m.price);
                        setPicker(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors',
                        m.id === assetId ? 'bg-surface-hover' : 'hover:bg-surface',
                      )}
                    >
                      <AssetMark symbol={m.symbol} glyph={m.glyph} hue={m.hue} size="sm" />
                      <span className="flex-1 text-sm text-fg">{m.symbol}-USD</span>
                      <span className={cn('text-2xs tabular-nums', m.change24h >= 0 ? 'text-up' : 'text-down')}>
                        {formatPercent(m.change24h)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className={cn('font-mono text-2xl font-semibold tabular-nums', up ? 'text-up' : 'text-down')}>
              {priceFmt(live)}
            </p>
            <p className="text-2xs text-fg-subtle">Last price</p>
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {[
              { k: '24h change', v: formatPercent(asset.change24h), tone: up ? 'text-up' : 'text-down' },
              { k: '24h high', v: priceFmt(asset.price * 1.024) },
              { k: '24h low', v: priceFmt(asset.price * 0.973) },
              { k: '24h volume', v: formatCompact(asset.volume24h, 'USD') },
              { k: 'Market cap', v: formatCompact(asset.marketCap, 'USD') },
            ].map((stat) => (
              <div key={stat.k}>
                <dt className="text-2xs uppercase tracking-wider text-fg-subtle">{stat.k}</dt>
                <dd className={cn('mt-0.5 font-mono text-sm tabular-nums text-fg', stat.tone)}>{stat.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem] 2xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          <ChartFrame
            title={`${market} · daily`}
            subtitle="Price and volume share one x-axis and keep separate scales — never a dual axis"
            legend={[
              { label: 'Close above open', color: 'var(--up)' },
              { label: 'Close below open', color: 'var(--down)' },
            ]}
            table={{
              columns: ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'],
              numericFrom: 1,
              rows: candles.slice(-30).map((c) => [
                fullDayLabel(c.t), priceFmt(c.o), priceFmt(c.h), priceFmt(c.l), priceFmt(c.c),
                formatCompact(c.v),
              ]),
            }}
          >
            <CandleChart
              candles={candles}
              height={360}
              formatPrice={priceFmt}
              formatAxis={(v) => formatCompact(v, 'USD')}
              formatX={dayLabel}
              formatVolume={(v) => formatCompact(v, 'USD')}
            />
          </ChartFrame>

          <Panel>
            <div className="mb-4 flex items-center gap-1 border-b border-line">
              {([['orders', `Open orders (${orders.length})`], ['fills', 'Recent fills']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={cn(
                    'relative px-3 pb-2.5 text-sm transition-colors',
                    tab === key ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {label}
                  {tab === key ? (
                    <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-soft" />
                  ) : null}
                </button>
              ))}
            </div>

            {tab === 'orders' ? (
              <TableShell caption="Open orders" minWidth="46rem">
                <thead>
                  <tr>
                    <Th>Market</Th><Th>Side</Th><Th>Type</Th>
                    <Th numeric>Price</Th><Th numeric>Size</Th><Th numeric>Filled</Th>
                    <Th className="hidden md:table-cell">Placed</Th><Th numeric>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <EmptyRow colSpan={8}>No open orders.</EmptyRow>
                  ) : (
                    orders.map((order) => (
                      <Tr key={order.id}>
                        <Td className="font-medium text-fg">{order.market}</Td>
                        <Td>
                          <Badge tone={order.side === 'buy' ? 'up' : 'down'}>{order.side}</Badge>
                        </Td>
                        <Td className="capitalize">{order.type}</Td>
                        <Td numeric>{moneyExact(order.price)}</Td>
                        <Td numeric>{formatQuantity(order.size, 4)}</Td>
                        <Td numeric>
                          {((order.filled / order.size) * 100).toFixed(0)}%
                        </Td>
                        <Td className="hidden md:table-cell">{dateTimeLabel(order.placedAt)}</Td>
                        <Td numeric>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-1 text-2xs text-fg-muted transition-colors hover:border-down/50 hover:text-down"
                          >
                            <X className="size-3" />
                            Cancel
                          </button>
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </TableShell>
            ) : (
              <TableShell caption="Recent fills" minWidth="42rem">
                <thead>
                  <tr>
                    <Th>Market</Th><Th>Side</Th><Th>Role</Th>
                    <Th numeric>Price</Th><Th numeric>Size</Th><Th numeric>Fee</Th><Th>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_FILLS.map((fill) => (
                    <Tr key={fill.id}>
                      <Td className="font-medium text-fg">{fill.market}</Td>
                      <Td>
                        <Badge tone={fill.side === 'buy' ? 'up' : 'down'}>{fill.side}</Badge>
                      </Td>
                      <Td className="capitalize">{fill.role}</Td>
                      <Td numeric>{moneyExact(fill.price)}</Td>
                      <Td numeric>{formatQuantity(fill.size, 4)}</Td>
                      <Td numeric>{moneyExact(fill.fee)}</Td>
                      <Td>{dateTimeLabel(fill.filledAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Place order" subtitle={`Available ${money(AVAILABLE_CASH)}`} />
            <OrderForm
              market={market}
              base={asset.symbol}
              price={limitPrice}
              available={AVAILABLE_CASH}
              onPriceChange={setLimitPrice}
            />
          </Panel>

          <Panel padded={false}>
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <h2 className="font-display text-sm font-semibold text-fg">Order book</h2>
              <SegmentedControl
                ariaLabel="Book grouping"
                size="sm"
                segments={[{ value: '1', label: '1' }, { value: '10', label: '10' }]}
                value="1"
                onChange={() => undefined}
              />
            </div>
            <OrderBook
              bids={book.bids}
              asks={book.asks}
              mid={asset.price}
              spread={book.spread}
              formatPrice={priceFmt}
              onPick={setLimitPrice}
            />
          </Panel>

          <ChartFrame
            title="Market depth"
            subtitle="Cumulative size either side of the mid"
            legend={[
              { label: 'Bids', color: 'var(--up)', shape: 'line' },
              { label: 'Asks', color: 'var(--down)', shape: 'line' },
            ]}
            table={{
              columns: ['Side', 'Price', 'Size', 'Cumulative'],
              numericFrom: 1,
              rows: [
                ...book.bids.map((b) => ['Bid', priceFmt(b.price), formatQuantity(b.size, 3), formatQuantity(b.total, 3)]),
                ...book.asks.map((a) => ['Ask', priceFmt(a.price), formatQuantity(a.size, 3), formatQuantity(a.total, 3)]),
              ],
            }}
          >
            <DepthChart bids={book.bids} asks={book.asks} mid={asset.price} formatPrice={priceFmt} />
          </ChartFrame>
        </div>
      </div>
    </>
  );
}
