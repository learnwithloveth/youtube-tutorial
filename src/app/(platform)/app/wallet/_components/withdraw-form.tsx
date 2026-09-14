'use client';

import { useActionState, useMemo, useState } from 'react';
import { ArrowUpFromLine, Check, Copy, Info, ShieldCheck, TriangleAlert } from 'lucide-react';

import type { AssetOptionDto, BalanceDto } from '@/modules/ledger';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';

import { requestWithdrawalAction } from '../_lib/actions';
import { IDLE_WITHDRAWAL_STATE } from '../_lib/form-state';

/**
 * The deposit / withdraw panel.
 *
 * ── A form posting to a Server Action, not a fetch ─────────────────────────────
 * `useActionState` gives the pending state and the server's reply without the form
 * owning a submission lifecycle, and the form still works before hydration: a
 * submit on a slow connection posts and gets a server-rendered response rather
 * than doing nothing until JavaScript arrives. On the one screen where a customer
 * moves money, "the button did nothing" is the worst available outcome.
 *
 * ── The client validates nothing that matters ──────────────────────────────────
 * The fee shown, the minimum, the network list — all of it is here to help someone
 * fill the form in, and none of it is a control. Every one of those rules is
 * re-applied in the ledger against values this component cannot influence. What is
 * rendered here is a convenience; what is enforced is on the server.
 */
export function WithdrawForm({
  assets,
  balances,
  depositAddresses,
}: {
  assets: readonly AssetOptionDto[];
  balances: readonly BalanceDto[];
  depositAddresses: Readonly<Record<string, string>>;
}) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('withdraw');
  const [assetCode, setAssetCode] = useState(assets[0]?.code ?? 'BTC');
  const [networkId, setNetworkId] = useState(assets[0]?.networks[0]?.id ?? '');
  const [copied, setCopied] = useState(false);

  const [state, submit, pending] = useActionState(
    requestWithdrawalAction,
    IDLE_WITHDRAWAL_STATE,
  );

  const asset = useMemo(
    () => assets.find((candidate) => candidate.code === assetCode) ?? assets[0],
    [assets, assetCode],
  );
  const network = asset?.networks.find((candidate) => candidate.id === networkId)
    ?? asset?.networks[0];

  const balance = balances.find((candidate) => candidate.asset === assetCode);
  const address = depositAddresses[assetCode] ?? '';

  const chooseAsset = (code: string) => {
    setAssetCode(code);
    // Networks are per asset; keeping the old selection would leave a Bitcoin
    // route selected for a USDC withdrawal, which the server would reject.
    const next = assets.find((candidate) => candidate.code === code);
    setNetworkId(next?.networks[0]?.id ?? '');
  };

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
    <div className="space-y-5">
      <SegmentedControl
        ariaLabel="Move money in or out"
        value={mode}
        onChange={setMode}
        segments={[
          { value: 'deposit', label: 'Deposit' },
          { value: 'withdraw', label: 'Withdraw' },
        ]}
      />

      <div>
        <p className="mb-2 text-xs text-fg-subtle">Asset</p>
        <div className="flex flex-wrap gap-2">
          {assets.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => chooseAsset(option.code)}
              aria-pressed={option.code === assetCode}
              className={cn(
                'rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                option.code === assetCode
                  ? 'border-brand-soft/60 bg-brand/12 text-fg'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {option.code}
            </button>
          ))}
        </div>
      </div>

      {mode === 'deposit' ? (
        <DepositPanel address={address} assetCode={assetCode} copied={copied} onCopy={copy} />
      ) : (
        <form action={submit} className="space-y-5">
          <input type="hidden" name="asset" value={assetCode} />

          <div>
            <p className="mb-2 text-xs text-fg-subtle">Network</p>
            <div className="space-y-2">
              {asset?.networks.map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors',
                    option.id === network?.id
                      ? 'border-brand-soft/60 bg-brand/12'
                      : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="network"
                      value={option.id}
                      checked={option.id === network?.id}
                      onChange={() => setNetworkId(option.id)}
                      className="sr-only"
                    />
                    <span className="text-sm text-fg">{option.label}</span>
                  </span>
                  <span className="text-2xs text-fg-subtle">
                    {option.fee} {assetCode} · {option.eta}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs text-fg-subtle">Destination address</span>
            <input
              name="destination"
              autoComplete="off"
              spellCheck={false}
              placeholder={`${assetCode} address on ${network?.label ?? ''}`}
              className="h-12 w-full rounded-lg border border-line bg-surface px-4 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-baseline justify-between text-xs text-fg-subtle">
              Amount
              {balance ? (
                <span className="tabular-nums">
                  {balance.available} {assetCode} available
                </span>
              ) : null}
            </span>
            <input
              name="amount"
              // `inputMode` rather than `type="number"`, which in several browsers
              // silently mangles long decimals and offers a spinner nobody wants on
              // an 8-decimal amount.
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="h-12 w-full rounded-lg border border-line bg-surface px-4 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
            />
            {asset ? (
              <span className="mt-1.5 block text-2xs text-fg-subtle">
                Minimum {asset.minimumWithdrawal} {asset.code}
                {network ? ` · ${network.fee} ${asset.code} network fee` : ''}
              </span>
            ) : null}
          </label>

          {state.message ? (
            <p
              role="status"
              className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-xs leading-relaxed',
                state.status === 'error'
                  ? 'border-down/35 bg-down/8 text-fg'
                  : 'border-up/35 bg-up/8 text-fg',
              )}
            >
              {state.status === 'error' ? (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-down" />
              ) : (
                <Check className="mt-0.5 size-3.5 shrink-0 text-up" />
              )}
              {state.message}
            </p>
          ) : null}

          <p className="flex items-start gap-2 text-2xs leading-relaxed text-fg-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-up" />
            Every withdrawal is reviewed by an operator before it leaves. Your balance
            is held, not spent, until that decision.
          </p>

          <Button type="submit" disabled={pending} className="w-full" sheen>
            <ArrowUpFromLine className="size-4" />
            {pending ? 'Submitting…' : 'Request withdrawal'}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * The deposit side.
 *
 * ── It shows an address and does not credit anything ───────────────────────────
 * There is no chain listener and no banking webhook behind this application, so
 * nothing here can know that money arrived. The two dishonest options were a button
 * that credits the customer — which is a button that prints money — and a timer
 * that pretends. Instead the address is shown, and an operator records the deposit
 * against its transaction reference once it actually lands.
 *
 * The addresses are per-asset platform deposit addresses supplied by configuration.
 * With none configured the panel says so rather than showing a plausible-looking
 * string, because an address that is not ours is a customer's funds sent nowhere.
 */
function DepositPanel({
  address,
  assetCode,
  copied,
  onCopy,
}: {
  address: string;
  assetCode: string;
  copied: boolean;
  onCopy: () => void;
}) {
  if (address.length === 0) {
    return (
      <div className="rounded-lg border border-warn/35 bg-warn/8 px-4 py-3.5">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <span>
            No {assetCode} deposit address is configured for this environment. Contact
            support before sending anything — funds sent to an address we do not
            control cannot be recovered.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs text-fg-subtle">Your {assetCode} deposit address</p>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{address}</code>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy deposit address"
            className="shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {copied ? <Check className="size-4 text-up" /> : <Copy className="size-4" />}
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 text-2xs leading-relaxed text-fg-subtle">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Send only {assetCode} to this address. Deposits are credited once an operator
        confirms them against the transaction on chain, which is why they are not
        instant.
      </p>
    </div>
  );
}
