import { BadgeCheck, ExternalLink, Eye, KeyRound } from 'lucide-react';

import type { LinkedWalletDto } from '@/modules/wallet-link';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { EmptyRow, TableShell, Td, Th, Tr } from '../../../../_console/components/table';
import { ConnectPanel } from './wallet-connect-panel';
import { EvidenceControl } from './wallet-evidence-control';
import { WalletRowActions } from './wallet-row-actions';
import { WatchAddressForm } from './wallet-watch-form';

/**
 * Wallet integration, as it appears once the account has enabled it.
 *
 * ── A Server Component inside a client shell ──────────────────────────────────
 * The settings shell is interactive and this is not: the table, the counts and
 * every explanation render on the server and arrive through a slot. Only the
 * connect panel, the row controls and the upload hydrate, and each is a leaf.
 *
 * ── What this page refuses to do ──────────────────────────────────────────────
 * There is no recovery-phrase field here, and there will not be one. A site that
 * receives a seed phrase can spend every account that phrase unlocks, immediately
 * and irreversibly, regardless of how the request is framed — "import", "restore",
 * "sync", "validate", "automatic". Every real integration in this space works the
 * way this one does, which is why the absence costs nothing. The warning is
 * repeated here as well as on the enable panel, because the person who most needs
 * it will meet the same request on a page that is pretending to be this one.
 *
 * ── Stacked, not a two-column grid ────────────────────────────────────────────
 * This lives in a settings tab that already gives up 14rem to the section rail, so
 * the side-by-side arrangement the standalone page used would leave both columns
 * too narrow for an address. Connect first, because it is what somebody who just
 * enabled the feature came here to do.
 */
export function WalletIntegration({
  board,
  appUrl,
  siteName,
  projectId,
}: {
  board: {
    readonly wallets: readonly LinkedWalletDto[];
    readonly verified: number;
    readonly watching: number;
    readonly degraded: boolean;
    readonly unavailable: boolean;
  };
  appUrl: string;
  siteName: string;
  projectId: string | null;
}) {
  return (
    <>
      <Panel className="border-[color-mix(in_oklab,var(--brand)_28%,transparent)]">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-brand-soft" />
          <div className="min-w-0 space-y-1.5">
            <h2 className="font-display text-base font-semibold text-fg">
              Novex will never ask for your recovery phrase
            </h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              Not here, not by email, not in support chat, and not to &ldquo;verify&rdquo;
              or &ldquo;restore&rdquo; anything. Connecting a wallet needs a signature,
              which your wallet produces without ever revealing your keys. If any site
              asks you to type twelve or twenty-four words, close it &mdash; whatever it
              looks like, and whatever it says it is for.
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Connect a wallet"
          /* Said "N more can be connected", counting down from a cap of ten.
             There is no cap, so there is nothing to count down and nothing that
             disables the panel once a number is reached. */
          subtitle="Sign a message to prove the address is yours"
        />
        <ConnectPanel
          disabled={board.unavailable}
          appUrl={appUrl}
          siteName={siteName}
          projectId={projectId}
        />
      </Panel>

      <Panel>
        <PanelHeader
          title="Your wallets"
          subtitle={
            board.unavailable
              ? 'Unavailable on this deployment'
              : board.degraded
                ? 'This list could not be loaded'
                : `${board.wallets.length} connected · ${board.verified} verified`
          }
        />

        {/* A failed read is stated, never rendered as an empty list. An empty
            table would tell somebody their wallets are gone. */}
        {board.degraded ? (
          <p className="py-10 text-center text-sm text-warn">
            We could not load your wallets just now. Nothing has changed &mdash; refresh
            in a moment.
          </p>
        ) : (
          <TableShell caption="Wallets connected to your account" minWidth="38rem">
            <thead>
              <tr>
                <Th>Wallet</Th>
                <Th>Network</Th>
                <Th>Status</Th>
                <Th>Connected</Th>
                <Th numeric>&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {board.wallets.length === 0 ? (
                <EmptyRow colSpan={5}>
                  No wallets connected yet. Use the panel above to connect one.
                </EmptyRow>
              ) : (
                board.wallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} />)
              )}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Add an address to watch"
          subtitle="A public address only — nothing is proved, and nothing is granted"
        />
        <WatchAddressForm />
      </Panel>
    </>
  );
}

function WalletRow({ wallet }: { wallet: LinkedWalletDto }) {
  return (
    <Tr>
      <Td>
        <div className="min-w-0">
          {wallet.label ? (
            <span className="block truncate text-sm font-medium text-fg">{wallet.label}</span>
          ) : null}
          {/* The full address, not only the shortened form. A shortened address
              cannot be checked against what a wallet shows, and checking it is the
              reason somebody looks at this column. */}
          <span className="block break-all font-mono text-2xs text-fg-muted">
            {wallet.address}
          </span>

          {/* Only where a file may actually be attached — a verified wallet has a
              signature, and offering an upload beside it would suggest the picture
              adds something. See `LinkedWallet.acceptsEvidence`. */}
          {wallet.acceptsEvidence ? (
            <EvidenceControl walletId={wallet.id} evidenceId={wallet.evidenceId} />
          ) : null}
        </div>
      </Td>
      <Td>
        {wallet.explorer ? (
          <a
            href={wallet.explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors duration-200 hover:text-fg"
          >
            {wallet.chain}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-xs">{wallet.chain}</span>
        )}
      </Td>
      <Td>
        {wallet.status === 'verified' ? (
          <Badge tone="up">
            <BadgeCheck className="size-3" />
            Verified
          </Badge>
        ) : (
          /* Never a green tick. The whole value of the verified badge is that it
             means something, which it stops doing the moment a row nobody proved
             anything about is allowed to look the same. */
          <Badge tone="neutral">
            <Eye className="size-3" />
            Watch only
          </Badge>
        )}
      </Td>
      <Td>
        <span className="text-xs">{formatDate(wallet.linkedAt)}</span>
        <span className="mt-0.5 block text-2xs text-fg-subtle">{connectorLabel(wallet)}</span>
      </Td>
      <Td numeric>
        <WalletRowActions id={wallet.id} address={wallet.address} label={wallet.label} />
      </Td>
    </Tr>
  );
}

const CONNECTOR_LABELS = {
  injected: 'Browser wallet',
  walletconnect: 'WalletConnect',
  manual: 'Added by hand',
} as const;

function connectorLabel(wallet: LinkedWalletDto): string {
  return CONNECTOR_LABELS[wallet.connector];
}
