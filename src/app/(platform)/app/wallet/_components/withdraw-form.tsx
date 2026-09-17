'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  Info,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react';

import type { AssetOptionDto, BalanceDto } from '@/modules/ledger';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { SegmentedControl } from '@/shared/ui/primitives/segmented-control';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';

import { requestWithdrawalAction } from '../_lib/actions';
import { submitDepositAction } from '../_lib/deposit-actions';
import { IDLE_DEPOSIT_STATE, IDLE_WITHDRAWAL_STATE } from '../_lib/form-state';

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
  /** Keyed `ASSET:NETWORK` — the pair, because the same token on two chains is two addresses. */
  depositAddresses: Readonly<Record<string, { address: string; demo: boolean }>>;
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
  const deposit = depositAddresses[`${assetCode}:${network?.id ?? ''}`] ?? null;

  const chooseAsset = (code: string) => {
    setAssetCode(code);
    // Networks are per asset; keeping the old selection would leave a Bitcoin
    // route selected for a USDT withdrawal, which the server would reject.
    const next = assets.find((candidate) => candidate.code === code);
    setNetworkId(next?.networks[0]?.id ?? '');
  };

  const copy = async () => {
    try {
      if (deposit === null) return;
      await navigator.clipboard.writeText(deposit.address);
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
                'inline-flex items-center gap-2 rounded-lg border py-2.5 pl-3 pr-4 text-sm font-medium transition-colors',
                option.code === assetCode
                  ? 'border-brand-soft/60 bg-brand/12 text-fg'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {/* The plain coin here, not a network variant: no chain is chosen yet.
                  The glyph and hue are only the fallback for an asset with no logo
                  file; the ledger's option carries neither. */}
              <AssetMark
                symbol={option.code}
                glyph={option.code.slice(0, 1)}
                hue="var(--chart-1)"
                size="xs"
              />
              {option.code}
            </button>
          ))}
        </div>
      </div>

      {mode === 'deposit' ? (
        <div className="space-y-5">
          {/* The network chooser is not optional on the deposit side. Sending USDT
              over Tron to an Ethereum address destroys it, so the chain has to be
              an explicit choice before an address is even shown. */}
          <NetworkChooser
            networks={asset?.networks ?? []}
            selected={network?.id ?? ''}
            onSelect={setNetworkId}
            assetCode={assetCode}
          />
          <DepositPanel
            deposit={deposit}
            assetCode={assetCode}
            networkLabel={network?.label ?? ''}
            copied={copied}
            onCopy={copy}
          />
          {deposit !== null ? (
            <ProofForm
              assetCode={assetCode}
              networkId={network?.id ?? ''}
              networkLabel={network?.label ?? ''}
            />
          ) : null}
        </div>
      ) : (
        <form action={submit} className="space-y-5">
          <input type="hidden" name="asset" value={assetCode} />

          <NetworkChooser
            networks={asset?.networks ?? []}
            selected={network?.id ?? ''}
            onSelect={setNetworkId}
            assetCode={assetCode}
            withFormField
          />

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
  deposit,
  assetCode,
  networkLabel,
  copied,
  onCopy,
}: {
  deposit: { address: string; demo: boolean } | null;
  assetCode: string;
  networkLabel: string;
  copied: boolean;
  onCopy: () => void;
}) {
  if (deposit === null) {
    return (
      <div className="rounded-lg border border-warn/35 bg-warn/8 px-4 py-3.5">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <span>
            No {assetCode} deposit address is configured for {networkLabel || 'this network'}.
            Contact support before sending anything &mdash; funds sent to an address we
            do not control cannot be recovered.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* {deposit.demo ? (
        // Loud, above the address, and impossible to scroll past. A demo address
        // that looks like a real one is the single most expensive thing this page
        // could get wrong.
        <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-3">
          <p className="flex items-start gap-2 text-xs font-medium leading-relaxed text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-down" />
            <span>
              Demo address &mdash; do not send real funds.{' '}
              <span className="font-normal text-fg-muted">
                This environment is configured with placeholder addresses. Anything
                sent here is unrecoverable.
              </span>
            </span>
          </p>
        </div>
      ) : null} */}

      <div>
        <p className="mb-2 text-xs text-fg-subtle">
          Your {assetCode} address on {networkLabel}
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">
            {deposit.address}
          </code>
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
        Send only {assetCode} over {networkLabel} to this address. The same token on
        another chain is a different address, and sending across the wrong one
        destroys it. Deposits are credited once an operator confirms the transaction
        on chain, which is why they are not instant.
      </p>
    </div>
  );
}

/**
 * The network picker, shared by both sides of the panel.
 *
 * On the withdraw side it carries the form field; on the deposit side it is pure
 * selection. One component either way, because the mistake it exists to prevent is
 * the same on both: choosing a chain the address does not belong to.
 */
function NetworkChooser({
  networks,
  selected,
  onSelect,
  assetCode,
  withFormField = false,
}: {
  networks: readonly AssetOptionDto['networks'][number][];
  selected: string;
  onSelect: (id: string) => void;
  assetCode: string;
  withFormField?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-fg-subtle">Network</p>
      <div className="space-y-2">
        {networks.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors',
              option.id === selected
                ? 'border-brand-soft/60 bg-brand/12'
                : 'border-line hover:border-line-strong',
            )}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                // Only the withdraw side posts; the deposit side selects without
                // contributing a field to the form.
                {...(withFormField ? { name: 'network' } : {})}
                value={option.id}
                checked={option.id === selected}
                onChange={() => onSelect(option.id)}
                className="sr-only"
              />
              {/* The coin on this chain — USDT with an Ethereum badge, or with a
                  Tron one — because this is the choice that loses funds when it is
                  wrong, and a badge is noticed where a label is skimmed. An asset
                  with one network, or no network logo, shows its plain mark. */}
              <AssetMark
                symbol={assetCode}
                network={option.id}
                glyph={assetCode.slice(0, 1)}
                hue="var(--chart-1)"
                size="sm"
              />
              <span className="text-sm text-fg">{option.label}</span>
            </span>
            {withFormField ? (
              <span className="text-2xs text-fg-subtle">
                {option.fee} {assetCode} · {option.eta}
              </span>
            ) : (
              <span className="text-2xs text-fg-subtle">{option.eta}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Telling us the transfer happened, with evidence.
 *
 * ── The button is disabled until a file is attached ────────────────────────────
 * Which is what the customer asked for, and it is the right shape for the reason
 * behind it: without proof there is nothing for an operator to check, so a claim
 * with no screenshot is a request to be given money. Disabling is better than
 * failing on submit here — the rule is knowable before the click, so the interface
 * should say so rather than let someone fill in a form and be refused.
 *
 * It is not a control. The server re-checks everything, sniffs the file from its
 * bytes, and refuses anything that is not an image. This only saves a round trip.
 */
function ProofForm({
  assetCode,
  networkId,
  networkLabel,
}: {
  assetCode: string;
  networkId: string;
  networkLabel: string;
}) {
  const [state, submit, pending] = useActionState(submitDepositAction, IDLE_DEPOSIT_STATE);
  const [fileName, setFileName] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const ready = fileName !== null && amount.trim().length > 0 && reference.trim().length > 0;

  return (
    <form action={submit} className="space-y-4 border-t border-line pt-5">
      <input type="hidden" name="asset" value={assetCode} />
      <input type="hidden" name="network" value={networkId} />

      <div>
        <p className="text-sm text-fg">Already sent it?</p>
        <p className="mt-0.5 text-2xs leading-relaxed text-fg-subtle">
          Tell us the amount and the transaction, and attach a screenshot. An operator
          checks it against the chain before your balance moves.
        </p>
      </div>

      <label className="block">
        <span className="mb-2 block text-xs text-fg-subtle">Amount sent</span>
        <input
          name="amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className="h-11 w-full rounded-lg border border-line bg-surface px-4 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs text-fg-subtle">
          Transaction hash or bank reference
        </span>
        <input
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Your ${networkLabel} transaction`}
          className="h-11 w-full rounded-lg border border-line bg-surface px-4 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
        />
      </label>

      <div>
        <span className="mb-2 block text-xs text-fg-subtle">Screenshot of the transfer</span>
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3.5 transition-colors',
            fileName !== null
              ? 'border-up/50 bg-up/8'
              : 'border-line hover:border-line-strong',
          )}
        >
          <input
            type="file"
            name="proof"
            // A hint to the file picker, not a control. The server decides what the
            // file is from its bytes and ignores both the extension and the type
            // the browser attaches.
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            className="sr-only"
          />
          {fileName !== null ? (
            <Check className="size-4 shrink-0 text-up" />
          ) : (
            <Upload className="size-4 shrink-0 text-fg-subtle" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-fg">
            {fileName ?? 'Choose a PNG, JPEG or WebP screenshot'}
          </span>
          <span className="shrink-0 text-2xs text-fg-subtle">
            {fileName === null ? 'Browse' : 'Change'}
          </span>
        </label>
      </div>

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

      <Button type="submit" disabled={!ready || pending} className="w-full">
        <ArrowDownToLine className="size-4" />
        {pending ? 'Submitting…' : 'Submit deposit for review'}
      </Button>

      {!ready ? (
        <p className="text-center text-2xs text-fg-subtle">
          Add the amount, the reference and a screenshot to continue.
        </p>
      ) : null}
    </form>
  );
}
