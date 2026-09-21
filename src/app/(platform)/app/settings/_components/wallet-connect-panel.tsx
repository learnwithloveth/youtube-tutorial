'use client';

import { startTransition, useActionState, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LoaderCircle, QrCode, Search, ShieldCheck, Smartphone, Wallet } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { linkWalletAction, requestChallengeAction } from '../_lib/wallet-actions';
import { IDLE_WALLET_FORM } from '../_lib/wallet-form-state';
import {
  connectWallet,
  describeWalletError,
  discoverWallets,
  mobileDeepLinks,
  signMessage,
  type DiscoveredWallet,
  type Eip1193Provider,
} from '../_lib/wallet-provider';
/* Type-only, so the relay client stays out of this chunk. The value import is the
   dynamic one inside `beginRelay`. */
import type { RelaySession } from '../_lib/walletconnect';

/**
 * The connect panel.
 *
 * ── The one Client Component on this page ─────────────────────────────────────
 * It has to be: the wallet lives in the browser and the whole flow is a
 * conversation with it. Everything else — the list of connected wallets, the
 * explanations, the chain names — is server-rendered around this island, so the
 * table does not ship as JSON plus the code to draw it.
 *
 * ── Three steps, and the middle one is not ours ───────────────────────────────
 *  1. The wallet says which account and chain it is on.
 *  2. The server composes a challenge and stores it.
 *  3. The wallet signs it; the server verifies and records the link.
 *
 * Step 2 exists so the signed text is one the server can rebuild at verification
 * time. A flow that skipped it and trusted the address the browser reported would
 * have no proof in it at all — it would be a text field with extra steps.
 *
 * ── What this component never asks for ────────────────────────────────────────
 * A seed phrase, a private key, a keystore file. There is no input for one, and
 * no legitimate wallet integration has ever needed one: the wallet signs, we
 * verify. If any site — this one included — ever shows you a field asking for a
 * recovery phrase, it is taking your funds, and there is no version of that
 * sentence with an exception in it.
 */

type Phase =
  | { readonly step: 'idle' }
  | { readonly step: 'connecting'; readonly wallet: string }
  | { readonly step: 'signing'; readonly wallet: string; readonly address: string }
  | { readonly step: 'failed'; readonly reason: string };

/** How the relay is named on screen, in one place so the button and the status agree. */
const RELAY_NAME = 'WalletConnect';

export function ConnectPanel({
  disabled,
  appUrl,
  siteName,
  projectId,
}: {
  disabled: boolean;
  appUrl: string;
  siteName: string;
  /** Null when no relay is configured — the QR option is then not offered. */
  projectId: string | null;
}) {
  const [wallets, setWallets] = useState<DiscoveredWallet[] | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });
  const [state, submit] = useActionState(linkWalletAction, IDLE_WALLET_FORM);

  /**
   * Asks the page's extensions to introduce themselves.
   *
   * On mount, and not behind the button: the list is what the button *is*, and
   * discovering after a click would mean a wait between pressing and anything
   * happening. Nothing is connected by this — announcing is not access, and no
   * wallet prompt appears until `eth_requestAccounts`.
   */
  useEffect(() => {
    let cancelled = false;
    void discoverWallets().then((found) => {
      if (!cancelled) setWallets(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Challenge, sign, submit — the half that is identical for every connector.
   *
   * An extension and a phone differ only in how a provider is obtained. Once
   * there is one, the proof is the same three steps, so they are written once:
   * two copies of this is how one of them quietly stops checking something.
   */
  const prove = useCallback(
    async (input: {
      provider: Eip1193Provider;
      address: string;
      chainId: number;
      connector: 'injected' | 'walletconnect';
      wallet: string;
    }) => {
      setPhase({ step: 'signing', wallet: input.wallet, address: input.address });

      const challenge = await requestChallengeAction({
        address: input.address,
        chainId: input.chainId,
      });
      if (!challenge.ok) {
        setPhase({ step: 'failed', reason: challenge.error });
        return;
      }

      const signature = await signMessage(input.provider, input.address, challenge.message);

      /*
       * Handed to the action as FormData rather than as arguments.
       *
       * `useActionState` is what gives this the server's reply, and its dispatch
       * takes the payload the action's signature expects. Wrapped in
       * `startTransition` because this call comes from an async handler rather
       * than from a form's `action`, and React requires the transition.
       */
      const payload = new FormData();
      payload.set('nonce', challenge.nonce);
      payload.set('signature', signature);
      payload.set('connector', input.connector);

      setPhase({ step: 'idle' });
      startTransition(() => submit(payload));
    },
    [submit],
  );

  const begin = useCallback(
    async (wallet: DiscoveredWallet) => {
      setPhase({ step: 'connecting', wallet: wallet.name });

      try {
        const account = await connectWallet(wallet.provider);
        await prove({
          provider: wallet.provider,
          address: account.address,
          chainId: account.chainId,
          connector: 'injected',
          wallet: wallet.name,
        });
      } catch (error) {
        setPhase({ step: 'failed', reason: describeWalletError(error) });
      }
    },
    [prove],
  );

  /**
   * The QR path, for a wallet that lives on a phone.
   *
   * The relay client is imported inside `openRelaySession`, so pressing this is
   * what fetches it. The session is closed in a `finally` whether the signature
   * succeeded, failed or was refused — a pairing left open is a live channel to
   * somebody's wallet that neither side has any further use for.
   */
  const beginRelay = useCallback(async () => {
    if (projectId === null) return;
    setPhase({ step: 'connecting', wallet: RELAY_NAME });

    let session: RelaySession | null = null;
    try {
      const { openRelaySession: open } = await import('../_lib/walletconnect');
      session = await open({ projectId, appUrl, siteName });

      await prove({
        provider: session.provider,
        address: session.address,
        chainId: session.chainId,
        connector: 'walletconnect',
        wallet: RELAY_NAME,
      });
    } catch (error) {
      setPhase({ step: 'failed', reason: describeWalletError(error) });
    } finally {
      await session?.disconnect();
    }
  }, [appUrl, projectId, prove, siteName]);

  const busy = phase.step === 'connecting' || phase.step === 'signing';

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-fg-muted">
        Connect a wallet you control. Your wallet will show you a short message to sign
        &mdash; signing it proves the address is yours. It moves no funds, approves no
        token, and gives this site no permission to spend anything.
      </p>

      {disabled ? (
        <Notice tone="warn">
          Wallet connections are not configured on this deployment.
        </Notice>
      ) : null}

      {/* ── What discovery found ───────────────────────────────────────────── */}
      {wallets === null ? (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <LoaderCircle className="size-3.5 animate-spin" />
          Looking for wallets in this browser&hellip;
        </p>
      ) : wallets.length === 0 ? (
        <Notice tone="neutral">
          <span className="flex items-start gap-2">
            <Search className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            <span>
              No wallet extension answered in this browser. Install one, or open this page
              in your phone&rsquo;s wallet app using a link below.
            </span>
          </span>
        </Notice>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              disabled={disabled || busy}
              onClick={() => void begin(wallet)}
              className={cn(
                'flex items-center gap-3 rounded-md border border-line bg-bg-elev/60 px-4 py-3 text-left',
                'transition-colors duration-200 hover:border-line-strong hover:bg-surface',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              {wallet.icon ? (
                // The extension supplies a data URI. Rendered directly rather than
                // through next/image, which would try to optimise a base64 string
                // it cannot fetch.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.icon} alt="" className="size-7 rounded-md" />
              ) : (
                <Wallet className="size-7 rounded-md p-1 text-brand-soft" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fg">{wallet.name}</span>
                <span className="block text-2xs text-fg-subtle">
                  {busy && phase.wallet === wallet.name
                    ? phase.step === 'connecting'
                      ? 'Waiting for your wallet…'
                      : 'Waiting for your signature…'
                    : 'Connect and sign'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── The relay, when one is configured ──────────────────────────────── */}
      {projectId !== null ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void beginRelay()}
          className={cn(
            'flex w-full items-center gap-3 rounded-md border border-line bg-bg-elev/60 px-4 py-3 text-left',
            'transition-colors duration-200 hover:border-line-strong hover:bg-surface',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <QrCode className="size-7 rounded-md p-1 text-brand-soft" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">{RELAY_NAME}</span>
            <span className="block text-2xs text-fg-subtle">
              {busy && phase.wallet === RELAY_NAME
                ? phase.step === 'connecting'
                  ? 'Waiting for your phone…'
                  : 'Waiting for your signature…'
                : 'Scan a code with a wallet on your phone'}
            </span>
          </span>
        </button>
      ) : null}

      {/* ── Where the flow stands, or why it stopped ───────────────────────── */}
      {phase.step === 'signing' ? (
        <Notice tone="brand">
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Check your wallet and read the message before approving. It should name{' '}
              <strong className="font-medium text-fg">{hostOf(appUrl)}</strong> and the account{' '}
              <span className="font-mono text-xs">{shorten(phase.address)}</span>.
            </span>
          </span>
        </Notice>
      ) : null}

      {phase.step === 'failed' ? <Notice tone="down">{phase.reason}</Notice> : null}

      {state.status === 'error' ? <Notice tone="down">{state.message}</Notice> : null}
      {state.status === 'linked' ? <Notice tone="up">{state.message}</Notice> : null}

      {/* ── The phone path ─────────────────────────────────────────────────── */}
      <div className="border-t border-line pt-4">
        <p className="flex items-center gap-2 text-xs font-medium text-fg">
          <Smartphone className="size-3.5 text-brand-soft" />
          Wallet on your phone?
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-fg-subtle">
          Open this page inside your wallet&rsquo;s own browser and the button above will
          find it. These links do that:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {mobileDeepLinks(`${appUrl}/app/settings?tab=wallets`).map((link) => (
            <a
              key={link.name}
              href={link.href}
              rel="noopener noreferrer"
              className="rounded-full border border-line px-3 py-1.5 text-2xs font-semibold text-fg-muted transition-colors duration-200 hover:border-line-strong hover:text-fg"
            >
              {link.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A short coloured note. Local to this panel — three tones, no variants API. */
function Notice({
  tone,
  children,
}: {
  tone: 'up' | 'down' | 'warn' | 'brand' | 'neutral';
  children: ReactNode;
}) {
  const TONES = {
    up: 'border-[color-mix(in_oklab,var(--up)_32%,transparent)] text-up',
    down: 'border-[color-mix(in_oklab,var(--down)_32%,transparent)] text-down',
    warn: 'border-[color-mix(in_oklab,var(--warn)_32%,transparent)] text-warn',
    brand: 'border-brand-soft/40 text-fg-muted',
    neutral: 'border-line text-fg-muted',
  } as const;

  return (
    <div className={cn('rounded-md border bg-bg-elev/40 px-4 py-3 text-xs leading-relaxed', TONES[tone])}>
      {children}
    </div>
  );
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
