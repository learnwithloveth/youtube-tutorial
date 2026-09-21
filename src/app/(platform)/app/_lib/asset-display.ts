import 'server-only';

import { withdrawableAssets } from '@/server/ledger';

/**
 * How to render a ledger asset code.
 *
 * ── Why the pages need this at all ────────────────────────────────────────────
 * The ledger's identity for an asset is `USDT_ERC20`, and that is what every
 * balance, entry, withdrawal and claim carries. It is the right thing to key on
 * and the wrong thing to print: nobody says "I hold forty USDT_ERC20". The ticker
 * is `USDT` for both tethers, and what tells them apart on screen is the name and
 * the chain badge on the coin — which is the same way a wallet app does it.
 *
 * ── And why the market lookup goes through here ───────────────────────────────
 * `marks.get(balance.asset)` used to work because a ledger code and a market
 * symbol were the same string. They are not any more: there are two tether assets
 * and one tether market, because a price is a statement about the token's dollar
 * value and not about which chain a unit is sitting on. A page that still matched
 * on the code would find no market for either — and an unpriced balance renders as
 * "not priced", so the symptom is a customer seeing their money and no total.
 *
 * Built from the catalogue rather than from a page's own literal map, so an asset
 * added tomorrow renders correctly without anybody editing four screens.
 */

export interface AssetDisplay {
  /** The ledger code. Also the map key. */
  readonly code: string;
  /** What to print as a unit: `USDT`. */
  readonly ticker: string;
  /** What to print as a name: `Tether (ERC-20)`. Carries the chain. */
  readonly name: string;
  /** The market-data symbol that prices it. */
  readonly quoteSymbol: string;
  /**
   * The one chain this asset lives on, or null when it travels several.
   *
   * Passed to `AssetMark` so the coin carries its chain's badge. Bitcoin is null —
   * on-chain and Lightning are one balance because they are one coin.
   */
  readonly network: string | null;
}

export function assetDisplayMap(): ReadonlyMap<string, AssetDisplay> {
  return new Map(
    withdrawableAssets().map((asset) => [
      asset.code,
      {
        code: asset.code,
        ticker: asset.ticker,
        name: asset.name,
        quoteSymbol: asset.quoteSymbol,
        network: asset.networks.length === 1 ? (asset.networks[0]?.id ?? null) : null,
      },
    ]),
  );
}

/**
 * A fallback for a code the catalogue no longer lists.
 *
 * A balance whose asset has been removed from under it must still render — that is
 * a row somebody needs to see, not one to hide — so the code stands in for every
 * field rather than the row disappearing.
 */
export function unknownAsset(code: string): AssetDisplay {
  return { code, ticker: code, name: code, quoteSymbol: code, network: null };
}
