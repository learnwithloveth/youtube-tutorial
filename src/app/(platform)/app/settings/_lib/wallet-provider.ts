/**
 * Talking to a browser wallet, with no SDK in between.
 *
 * ── Why there is no library here ──────────────────────────────────────────────
 * A browser wallet is an EIP-1193 object with one method, `request`, and the whole
 * connect flow is three calls to it. The connector libraries that wrap this exist
 * to paper over dozens of chains and a transaction layer, and this page has
 * neither: it asks who you are, which network you are on, and for one signature.
 * Adding a megabyte of wallet SDK to a dashboard route to avoid twenty lines is a
 * bad trade, and every one of those bytes runs in the page that handles the
 * customer's session.
 *
 * ── Discovery is EIP-6963, not `window.ethereum` ──────────────────────────────
 * `window.ethereum` is a single slot that every extension used to fight over, so
 * on a machine with two wallets installed it is whichever one won the race — the
 * cause of "it keeps opening the wrong wallet". EIP-6963 replaced it with an
 * announcement protocol: the page asks, each extension answers with its own name,
 * icon and provider object, and the person chooses. The legacy slot is still read,
 * but only as a fallback for a wallet that has not adopted the standard, and only
 * when nothing announced itself.
 *
 * ── Nothing in this file can see a key ────────────────────────────────────────
 * `personal_sign` is a request to the wallet; the wallet shows the message, the
 * person approves it, and a signature comes back. The key stays in the extension.
 * There is no call here that asks for key material, and no wallet would answer one.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface DiscoveredWallet {
  /** The wallet's reverse-DNS id, e.g. `io.metamask`. Stable; used as a key. */
  readonly id: string;
  readonly name: string;
  /** A data URI the extension supplies. Rendered as-is; never fetched. */
  readonly icon: string;
  readonly provider: Eip1193Provider;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

/**
 * Every wallet that answers, over a short window.
 *
 * ── Why this is time-boxed rather than awaited ────────────────────────────────
 * The protocol has no "that is all of them" signal — extensions answer whenever
 * their content script is ready, which is immediate for one already injected and a
 * few hundred milliseconds for one still starting. So the page listens, asks, and
 * settles. 300ms is long enough for a cold extension and short enough that the
 * button does not feel stuck.
 *
 * The listener is attached *before* the request event is dispatched. The other way
 * round is a race that works on every machine where the extension is slow and
 * fails on the machine where it is fast — the worst kind of bug to be told about.
 */
export function discoverWallets(timeoutMs = 300): Promise<DiscoveredWallet[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);

  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (!detail?.info?.rdns || typeof detail.provider?.request !== 'function') return;

      // Keyed by rdns, so an extension that announces twice — which happens on a
      // page that re-requests — appears once.
      found.set(detail.info.rdns, {
        id: detail.info.rdns,
        name: detail.info.name,
        icon: detail.info.icon,
        provider: detail.provider,
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);

      if (found.size === 0) {
        const legacy = legacyProvider();
        if (legacy !== null) found.set('legacy', legacy);
      }

      resolve([...found.values()]);
    }, timeoutMs);
  });
}

/**
 * The old single-slot provider, for a wallet that has not adopted EIP-6963.
 *
 * Named "Browser wallet" rather than guessed at. The `isMetaMask` flag that code
 * used to branch on is set by several wallets that are not MetaMask — it became a
 * compatibility shim years ago — so reading it produces a confident label that is
 * often wrong. An honest generic name beats a specific one nobody can rely on.
 */
function legacyProvider(): DiscoveredWallet | null {
  const injected = (window as { ethereum?: Eip1193Provider }).ethereum;
  if (!injected || typeof injected.request !== 'function') return null;

  return { id: 'injected', name: 'Browser wallet', icon: '', provider: injected };
}

export interface ConnectedAccount {
  readonly address: string;
  readonly chainId: number;
}

/**
 * Asks the wallet who is connected, prompting if it has to.
 *
 * `eth_requestAccounts` is the call that raises the wallet's approval dialog, so
 * it must happen inside a user gesture — browsers and wallets both suppress it
 * otherwise, and the symptom is a button that silently does nothing.
 */
export async function connectWallet(provider: Eip1193Provider): Promise<ConnectedAccount> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as unknown;
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof address !== 'string' || address.length === 0) {
    throw new WalletError('Your wallet did not return an account.');
  }

  const raw = (await provider.request({ method: 'eth_chainId' })) as unknown;
  const chainId = typeof raw === 'string' ? Number.parseInt(raw, 16) : Number(raw);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new WalletError('Your wallet did not report which network it is on.');
  }

  return { address, chainId };
}

/**
 * Asks the wallet to sign a message, and returns the signature.
 *
 * ── The message is hex-encoded ────────────────────────────────────────────────
 * `personal_sign` takes its message as hex. Most wallets also accept a raw string
 * and guess, and the guess is wrong for any message that happens to look like hex
 * — which is a bug that appears once in a thousand nonces and is unreproducible
 * when reported. Encoding removes the guess. The wallet still shows the decoded
 * text, which is the whole point of the readable message.
 *
 * ── Parameter order is message, then address ──────────────────────────────────
 * The reverse of `eth_sign`, which is a long-standing source of confusion. Getting
 * it wrong produces a signature over the address, which recovers to nobody.
 */
export async function signMessage(
  provider: Eip1193Provider,
  address: string,
  message: string,
): Promise<string> {
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [toHex(message), address],
  })) as unknown;

  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new WalletError('Your wallet returned something that is not a signature.');
  }

  return signature;
}

/** An error with a message worth showing. Anything else is reported generically. */
export class WalletError extends Error {}

/**
 * What went wrong, in words.
 *
 * EIP-1193 gives 4001 to "the user rejected the request", which is not an error at
 * all — it is somebody deciding not to. It gets its own sentence so the panel does
 * not accuse a person of a failure when they simply pressed cancel.
 */
export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message;

  const code = (error as { code?: unknown } | null)?.code;
  if (code === 4001) return 'You cancelled the request in your wallet.';
  if (code === -32002) return 'Your wallet already has a request open. Finish it, then try again.';

  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.length > 0
    ? message
    : 'Your wallet could not complete that request.';
}

function toHex(value: string): string {
  let out = '0x';
  for (const byte of new TextEncoder().encode(value)) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Where to send somebody whose wallet is on their phone.
 *
 * ── Why deep links and not a QR relay ─────────────────────────────────────────
 * A mobile wallet's in-app browser injects a provider, so the flow above works
 * inside it unchanged. These links open this page there. That covers the mobile
 * case with no relay service, no project registration and no third party in the
 * path of a signature — see the page's notes for what a WalletConnect relay would
 * add, and what it would cost.
 */
export function mobileDeepLinks(url: string): readonly { name: string; href: string }[] {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  const encoded = encodeURIComponent(url);

  return [
    { name: 'MetaMask', href: `https://metamask.app.link/dapp/${withoutScheme}` },
    { name: 'Trust Wallet', href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encoded}` },
    { name: 'Coinbase Wallet', href: `https://go.cb-w.com/dapp?cb_url=${encoded}` },
    { name: 'Rainbow', href: `https://rnbwapp.com/to/dapp/${withoutScheme}` },
  ];
}
