'use client';

import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, Info, ShieldCheck } from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../_console/components/table';
import { StatTile, Meter } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { Badge } from '@/shared/ui/primitives/badge';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { usePortfolio } from '../../_data/use-account';
import { AVAILABLE_CASH } from '../../_data/data';
import { money, moneyExact } from '../../../_console/data/format';
import { formatQuantity } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

const NETWORKS: Record<string, { label: string; fee: string; minutes: string }[]> = {
  BTC: [{ label: 'Bitcoin', fee: '0.00004 BTC', minutes: '~20 min' }, { label: 'Lightning', fee: '1 sat', minutes: 'Instant' }],
  ETH: [{ label: 'Ethereum', fee: '0.0011 ETH', minutes: '~3 min' }, { label: 'Base', fee: '0.00002 ETH', minutes: '~30 sec' }, { label: 'Arbitrum', fee: '0.00003 ETH', minutes: '~30 sec' }],
  USDC: [{ label: 'Solana', fee: '0.00001 USDC', minutes: 'Instant' }, { label: 'Base', fee: '0.02 USDC', minutes: '~30 sec' }, { label: 'Ethereum', fee: '1.80 USDC', minutes: '~3 min' }],
};

const ADDRESSES: Record<string, string> = {
  BTC: 'bc1q9x4k2vn8t7dmsr0hqe3jlz6yfp2wa5cug8mn4d',
  ETH: '0x7Ae4d81C93bF2a09E5cB88016fD5Ea3c7d92b104',
  USDC: '9xQeWvG8trkVBnDh4rEyPxKmL2ZaJcU6NwFq3sYb1TdA',
};

export default function WalletPage() {

  const { holdings, total, netWorth } = usePortfolio();
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [symbol, setSymbol] = useState<'BTC' | 'ETH' | 'USDC'>('BTC');
  const [network, setNetwork] = useState(0);
  const [copied, setCopied] = useState(false);

  // Both maps are keyed by symbol and the picker only offers keys they have,
  // but an index signature cannot express that — so default rather than assert.
  const nets = NETWORKS[symbol] ?? [];
  const selectedNetwork = nets[network];
  const address = ADDRESSES[symbol] ?? '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard is unavailable in some embedded contexts */
    }
  };

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Move money in and out. Local rails are free; on-chain fees are passed through at cost."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total balance" value={moneyExact(netWorth)} delta={{ value: 'Cash + assets', direction: 'flat', period: '' }} />
        <StatTile label="Cash available" value={money(AVAILABLE_CASH)} delta={{ value: '+$5,000', direction: 'up', period: 'this week' }} />
        <StatTile label="Assets" value={money(total)} delta={{ value: `${holdings.length} held`, direction: 'flat', period: '' }} />
        <StatTile label="Pending" value={money(1_240)} delta={{ value: '1 deposit', direction: 'flat', period: 'settling' }} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Panel>
          <SegmentedControl
            ariaLabel="Transfer direction"
            className="mb-5 w-full [&>button]:flex-1"
            segments={[
              { value: 'deposit', label: 'Deposit' },
              { value: 'withdraw', label: 'Withdraw' },
            ]}
            value={mode}
            onChange={setMode}
          />

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs text-fg-muted">Asset</p>
              <div className="flex gap-2">
                {(['BTC', 'ETH', 'USDC'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSymbol(s);
                      setNetwork(0);
                    }}
                    aria-pressed={symbol === s}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                      symbol === s
                        ? 'border-brand-soft/60 bg-brand/12 text-fg'
                        : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-fg-muted">Network</p>
              <ul className="space-y-2">
                {nets.map((net, i) => (
                  <li key={net.label}>
                    <button
                      type="button"
                      onClick={() => setNetwork(i)}
                      aria-pressed={network === i}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                        network === i ? 'border-brand-soft/60 bg-brand/10' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span className="text-sm text-fg">{net.label}</span>
                      <span className="text-2xs tabular-nums text-fg-subtle">
                        {net.fee} · {net.minutes}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {mode === 'deposit' ? (
              <div className="rounded-md border border-line bg-bg-sunken/60 p-4">
                <p className="text-xs text-fg-muted">Your {symbol} deposit address</p>
                <div className="mt-2 flex items-start gap-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{address}</code>
                  <button
                    type="button"
                    onClick={copy}
                    aria-label="Copy deposit address"
                    className="grid size-8 shrink-0 place-items-center rounded-sm border border-line text-fg-subtle transition-colors hover:text-fg"
                  >
                    {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
                <p className="mt-3 flex gap-2 text-2xs leading-relaxed text-warn">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  Send only {symbol} over {selectedNetwork?.label}. Assets sent on another network are
                  unrecoverable.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs text-fg-muted">Destination address</span>
                  <input
                    placeholder={`${symbol} address on ${selectedNetwork?.label ?? ''}`}
                    className="h-11 w-full rounded-md border border-line bg-bg-sunken/60 px-3 font-mono text-xs text-fg outline-none transition-colors hover:border-line-strong focus:border-brand-soft"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-fg-muted">Amount</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-11 w-full rounded-md border border-line bg-bg-sunken/60 px-3 font-mono text-sm tabular-nums text-fg outline-none transition-colors hover:border-line-strong focus:border-brand-soft"
                  />
                </label>
                <p className="flex gap-2 text-2xs leading-relaxed text-fg-subtle">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-up" />
                  New addresses are held for 24 hours before the first withdrawal can leave.
                </p>
              </div>
            )}

            <Button size="lg" className="w-full">
              {mode === 'deposit' ? (
                <>
                  <ArrowDownToLine className="size-4" />
                  I&apos;ve sent the deposit
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="size-4" />
                  Review withdrawal
                </>
              )}
            </Button>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Daily limits" subtitle={`${'Gold'} tier · resets 00:00 UTC`} />
            <div className="space-y-5">
              <Meter label="Withdrawals today" value={12_400} max={250_000} formatValue={money} />
              <Meter label="Card purchases today" value={3_100} max={10_000} formatValue={money} tone="warn" />
              <Meter label="Bank deposits today" value={5_000} max={500_000} formatValue={money} />
            </div>
            <p className="mt-5 border-t border-line pt-4 text-2xs leading-relaxed text-fg-subtle">
              Limits rise automatically with your tier. Institutional accounts are uncapped subject
              to the desk&apos;s risk review.
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Balances" subtitle="Held on the exchange" />
            <TableShell caption="Asset balances" minWidth="34rem">
              <thead>
                <tr>
                  <Th>Asset</Th><Th numeric>Available</Th><Th numeric>Staked</Th><Th numeric>Value</Th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <Tr key={h.asset.id}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <AssetMark symbol={h.asset.symbol} glyph={h.asset.glyph} hue={h.asset.hue} size="sm" />
                        <span className="text-sm font-medium text-fg">{h.asset.symbol}</span>
                      </span>
                    </Td>
                    <Td numeric>{formatQuantity(h.quantity - h.staked, 4)}</Td>
                    <Td numeric>
                      {h.staked > 0 ? (
                        <Badge tone="brand">{formatQuantity(h.staked, 2)}</Badge>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td numeric className="font-medium text-fg">{moneyExact(h.value)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          </Panel>
        </div>
      </div>
    </>
  );
}
