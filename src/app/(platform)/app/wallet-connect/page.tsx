import { redirect } from 'next/navigation';

/**
 * Where wallet integration used to live.
 *
 * It is a Settings tab now. This route stays as a redirect rather than being
 * deleted, because notifications that were already sent carry this link: a
 * `wallet-linked` push from last week opens it, and a 404 at the end of a
 * notification about somebody's wallet is the worst moment to show one.
 *
 * Temporary rather than permanent, deliberately. A 308 is cached by browsers
 * indefinitely and is awkward to take back; this costs one hop and stays
 * reversible. It can be dropped once the pushes that reference it have aged out —
 * `wallet-linked` is a security kind, so that is a year.
 */
export default function WalletConnectRedirect(): never {
  redirect('/app/settings?tab=wallets');
}
