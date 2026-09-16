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
 * are drawn from 32px in a table row up to 56px on an asset page, and on a
 * high-density screen the 64px bitmaps below are already being scaled past their
 * pixel count. An SVG is also a fraction of the bytes.
 *
 * Only these three files are not yet listings — litecoin, monero and sui are in
 * `public/` and their entries are here ready, so listing one is a catalogue edit
 * and nothing else.
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

  // Not listed in the catalogue yet; the files are here.
  LTC: '/litecoin.png',
  XMR: '/monero.png',
  SUI: '/sui.png',
};

/**
 * The logo for a symbol, or null when this application ships none.
 *
 * Null is the ordinary case — most of the catalogue has no logo file — and the
 * caller renders the lettered mark for it rather than a gap.
 */
export function assetLogoFor(symbol: string): string | null {
  return ASSET_LOGOS[symbol.trim().toUpperCase()] ?? null;
}
