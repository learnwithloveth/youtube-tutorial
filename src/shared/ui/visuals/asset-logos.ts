/**
 * Brand logos this application ships, by asset symbol.
 *
 * ── Why a list and not a convention ───────────────────────────────────────────
 * Deriving `/${symbol.toLowerCase()}.png` would be shorter and would break the
 * moment a file is missing: the browser requests an image that is not there, and
 * every asset without one renders as a broken-image icon in the middle of a price
 * table. A symbol that is absent from this map has no logo, which the mark handles
 * by drawing the lettered badge instead — the same rule the rest of this codebase
 * follows about missing data.
 *
 * ── Adding one ───────────────────────────────────────────────────────────────
 * Drop the file in `public/` and add a line here. **Prefer an SVG**: these marks
 * are drawn from 20px in a picker up to 56px on an asset page, and on a
 * high-density screen the 64px bitmaps below are already being scaled past their
 * pixel count. An SVG is also a fraction of the bytes.
 *
 * Litecoin, monero and sui have files and entries but are not listings yet, so
 * listing one is a catalogue edit and nothing else.
 */
export const ASSET_LOGOS: Readonly<Record<string, string>> = {
  BTC: '/bitcoin.gif',
  ETH: '/ethereum.png',
  SOL: '/solana.png',
  USDC: '/usdc.png',
  USDT: '/usdt.png',
  XRP: '/xrp.png',
  BNB: '/bnb.png',
  LINK: '/chainlink.png',
  TRX: '/tron.png',

  // Not listed in the catalogue yet; the files are here.
  LTC: '/litecoin.png',
  XMR: '/monero.png',
  SUI: '/sui.png',
};

/**
 * Logos for one asset on one network, keyed `SYMBOL:networkId`.
 *
 * ── Why these exist ──────────────────────────────────────────────────────────
 * USDT is one asset with one price and two chains, and the chain is the part a
 * customer must not get wrong: USDT sent over Tron to an Ethereum address is gone.
 * The price table has no reason to care which chain, so it keeps the plain Tether
 * mark. The deposit and withdrawal screens do, and there the mark carries the
 * chain's badge, so the choice is visible and not just written in a label.
 *
 * The network ids are the ledger's — `ethereum`, `tron` — so a key here lines up
 * with the network a withdrawal or a deposit address was actually recorded against.
 *
 * For USDT these are not a *preference* over a plain mark, they are the only marks
 * there are — see the note where its entry would have been in `ASSET_LOGOS`.
 */
export const NETWORK_LOGOS: Readonly<Record<string, string>> = {
  'USDT:ethereum': '/usdt-eth.png',
  'USDT:tron': '/usdt-trx.png',
};

export interface AssetLogo {
  readonly src: string;
  /**
   * A network logo, drawn as a composite: the coin's disc with the chain's badge
   * overlapping its edge. It must be shown whole — clipping it to a circle, as the
   * plain logos are, would cut the badge off, and the badge is the point.
   */
  readonly composite: boolean;
}

/**
 * The logo for a symbol, preferring the network's own when one is given and known.
 *
 * Null is the ordinary case — most of the catalogue has no logo file — and the
 * caller renders the lettered mark for it rather than a gap. An unknown network
 * falls back to the asset's plain logo rather than to nothing: the coin is still
 * the coin. For USDT there is no plain logo to fall back to, on purpose, so an
 * unknown network there lands on the lettered ₮ rather than on a mark that would
 * name a chain nobody recorded.
 */
export function assetLogoFor(symbol: string, network?: string | null): AssetLogo | null {
  const code = symbol.trim().toUpperCase();

  if (network) {
    const composite = NETWORK_LOGOS[`${code}:${network.trim().toLowerCase()}`];
    if (composite) return { src: composite, composite: true };
  }

  const plain = ASSET_LOGOS[code];
  return plain ? { src: plain, composite: false } : null;
}
