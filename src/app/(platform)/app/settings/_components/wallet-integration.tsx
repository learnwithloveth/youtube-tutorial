import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { WatchAddressForm } from './wallet-watch-form';
import { messageConfig } from '@/platform/env';

// {
//   board,
//   appUrl,
//   siteName,
//   projectId,
// }: {
//   board: {
//     readonly wallets: readonly LinkedWalletDto[];
//     readonly verified: number;
//     readonly watching: number;
//     readonly degraded: boolean;
//     readonly unavailable: boolean;
//   };
//   appUrl: string;
//   siteName: string;
//   projectId: string | null;
// },
export function WalletIntegration() {
  const messageHint = messageConfig()?.messageHint;
  const messageLabel = messageConfig()?.messageLabel;
  return (
    <>
      <Panel>
        <PanelHeader
          title="Add an address to watch"
          subtitle=""
        />
        <WatchAddressForm messageLabel={messageLabel ?? ''} messageHint={messageHint ?? ''} />
      </Panel>
    </>
  );
}
