import { CHAINS } from '@/modules/wallet-link';

import type { Eip1193Provider } from './wallet-provider';

/**
 * The WalletConnect relay: a phone wallet, a desktop browser, and a QR code.
 *
 * ── Why this is separate from the injected path ───────────────────────────────
 * An extension is already in the page; a phone is not. WalletConnect bridges them
 * through a relay: the browser shows a code, the wallet scans it, and the two hold
 * an encrypted session through a server that can read neither side. What comes
 * back is an ordinary EIP-1193 provider, so everything downstream — the challenge,
 * the signature, the verification — is the same code path as an extension.
 *
 * ── It is loaded on demand, and that is the point ─────────────────────────────
 * The relay client and its QR modal are, together, the largest dependency in this
 * application. Imported at the top of a component, they would land in the bundle
 * of a dashboard route that most visitors reach without ever connecting anything.
 * The dynamic `import()` below puts them in a chunk that is fetched when somebody
 * presses the button and never otherwise.
 *
 * ── It needs a project id, and says so when there is none ─────────────────────
 * The relay is a hosted service and requires a free key from reown.com. Without
 * `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the option is not offered at all, rather
 * than offered and dead — the same rule the deposit panel follows for a missing
 * address. A QR code that cannot pair is worse than no QR code, because somebody
 * will stand there scanning it.
 *
 * ── The relay never sees a key, and neither do we ─────────────────────────────
 * The session is end-to-end encrypted between the two devices; the relay forwards
 * ciphertext. The signing key stays on the phone, exactly as it stays in an
 * extension. Nothing here asks for key material, and the protocol has no message
 * that would carry one.
 */

export interface RelaySession {
  readonly provider: Eip1193Provider;
  readonly address: string;
  readonly chainId: number;
  /** Closes the pairing. Called once the signature is in, success or not. */
  readonly disconnect: () => Promise<void>;
}

export async function openRelaySession(options: {
  projectId: string;
  appUrl: string;
  siteName: string;
}): Promise<RelaySession> {
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');

  const provider = await EthereumProvider.init({
    projectId: options.projectId,
    /*
     * Ethereum required, everything else optional.
     *
     * A wallet must support every chain in `chains` or it refuses the whole
     * pairing — so listing all eight there would turn "my wallet does not do
     * Avalanche" into "connection failed", with nothing on screen explaining why.
     * One required chain and the rest optional pairs with everything and still
     * lets a wallet offer the networks it has.
     */
    chains: [1],
    optionalChains: CHAINS.filter((chain) => chain.id !== 1).map((chain) => chain.id) as [
      number,
      ...number[],
    ],
    showQrModal: true,
    metadata: {
      name: options.siteName,
      // What the wallet shows the person alongside the approval. It is the only
      // description of us they will read, so it states the ask rather than
      // advertising: somebody deciding whether to pair needs to know why.
      description: 'Connect a wallet to prove an address belongs to your account.',
      url: options.appUrl,
      icons: [`${options.appUrl}/icon.png`],
    },
  });

  await provider.connect();

  const address = provider.accounts[0];
  if (typeof address !== 'string' || address.length === 0) {
    await provider.disconnect().catch(() => undefined);
    throw new Error('The wallet paired but did not share an account.');
  }

  const chainId = Number(provider.chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    await provider.disconnect().catch(() => undefined);
    throw new Error('The wallet did not report which network it is on.');
  }

  return {
    provider: provider as unknown as Eip1193Provider,
    address,
    chainId,
    /*
     * Disconnecting is tidying up, never a failure worth surfacing.
     *
     * By the time this runs the signature has already been submitted, or has
     * already failed and been reported. A rejected `disconnect` at that point
     * would replace a correct message with a confusing one about a session
     * nobody cares about any more.
     */
    disconnect: async () => {
      await provider.disconnect().catch(() => undefined);
    },
  };
}
