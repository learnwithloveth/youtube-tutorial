'use client';

import { useActionState, type ReactNode } from 'react';
import { Link2, Power, ShieldCheck } from 'lucide-react';

import { Button } from '@/shared/ui/primitives/button';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import {
  disableWalletLinkAction,
  enableWalletLinkAction,
} from '../_lib/wallet-actions';
import { IDLE_WALLET_FORM } from '../_lib/wallet-form-state';

/**
 * The Wallets tab's on/off switch, and what sits behind it.
 *
 * ── Off is the default, and it is a real state ────────────────────────────────
 * An account that has never opened this tab has no row in `wallet_link.settings`,
 * and every write path in the module refuses until it does. So this is a control
 * rather than a curtain: the panel being hidden is a consequence of the setting,
 * not the whole of it. A POST that skipped the UI gets the same refusal.
 *
 * ── The children are server-rendered ──────────────────────────────────────────
 * This component is interactive and the wallet list is not, so the list arrives as
 * already-rendered output through `children` — the `sessions` slot in
 * `SettingsShell` does the same thing for the same reason. Turning the tab into a
 * client boundary would have shipped every row as JSON plus the code to draw it.
 *
 * ── Nothing here asks for a recovery phrase, and the off state says so ────────
 * The sentence is on the enable panel rather than only behind it, because somebody
 * deciding whether to turn this on is exactly the person who has not yet read what
 * a wallet connection does and does not involve.
 */
export function WalletIntegrationGate({
  enabled,
  children,
}: {
  enabled: boolean;
  /** The wallet panels, rendered on the server. Absent when the feature is off. */
  children: ReactNode;
}) {
  const [enableState, enable, enabling] = useActionState(
    enableWalletLinkAction,
    IDLE_WALLET_FORM,
  );
  const [disableState, disable, disabling] = useActionState(
    disableWalletLinkAction,
    IDLE_WALLET_FORM,
  );

  if (!enabled) {
    return (
      <Panel>
        <PanelHeader
          title="Wallet integration"
          subtitle="Off. Nothing is connected to this account."
        />

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-fg-muted">
            Connect a self-custody wallet &mdash; MetaMask, Trust, Rabby, a hardware
            wallet &mdash; to prove an address belongs to you. Your wallet signs a short
            message; your keys never leave it.
          </p>

          <ul className="space-y-2.5 text-xs leading-relaxed text-fg-muted">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-up" />
              <span>
                A signature proves control of an address. It moves no funds and approves
                no token.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Link2 className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
              <span>
                We store an address and a date. Both are public; neither can spend
                anything.
              </span>
            </li>
           
          </ul>

          {enableState.status === 'error' ? (
            <p role="alert" className="text-xs text-down">
              {enableState.message}
            </p>
          ) : null}

          <form action={enable}>
            <Button type="submit" disabled={enabling}>
              <Power className="size-4" />
              {enabling ? 'Enabling…' : 'Enable'}
            </Button>
          </form>
        </div>
      </Panel>
    );
  }

  return (
    <>
      {children}

      <Panel>
        <PanelHeader
          title="Turn off wallet integration"
          subtitle="Only possible once nothing is connected"
        />
        <p className="text-xs leading-relaxed text-fg-subtle">
          Turning this off hides the feature and leaves no address attached to your
          account. Disconnect your wallets above first &mdash; we will not switch it off
          while any are still linked, because that would look like they were gone when
          they were not.
        </p>

        {disableState.status === 'error' ? (
          <p role="alert" className="mt-3 text-xs text-down">
            {disableState.message}
          </p>
        ) : null}

        <form action={disable} className="mt-4">
          <Button type="submit" variant="outline" size="sm" disabled={disabling}>
            <Power className="size-3.5" />
            {disabling ? 'Turning off…' : 'Turn off'}
          </Button>
        </form>
      </Panel>
    </>
  );
}
