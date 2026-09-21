import type { LinkedWalletDto } from '@/modules/wallet-link';
import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { WatchAddressForm } from './wallet-watch-form';
import { messageConfig } from '@/platform/env';

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
  const messageHint = messageConfig()?.messageHint;
  const messageLabel = messageConfig()?.messageLabel;
  return (
    <>
      <Panel>
        <PanelHeader
          title="Add an address to watch"
          subtitle="A public address only — nothing is proved, and nothing is granted"
        />
        <WatchAddressForm messageLabel={messageLabel ?? ''} messageHint={messageHint ?? ''} />
      </Panel>
    </>
  );
}


