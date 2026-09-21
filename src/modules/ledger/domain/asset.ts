/**
 * What the ledger needs to know about an asset.
 *
 * ── Why this is not market-data's instrument ───────────────────────────────────
 * `market-data` already has a catalogue with names, glyphs, brand hues and feed
 * ids. None of that is the ledger's business, and the two things it *does* need —
 * the precision to store an amount at, and which networks a withdrawal may use —
 * are not in that catalogue at all.
 *
 * They are also owned differently. A quoting precision changes when a writer
 * decides a price reads better with fewer decimals. A *storage* precision cannot
 * change without rewriting every balance, because it is the definition of what the
 * stored integer means. Sharing one number between the two would mean an editorial
 * decision could silently divide everyone's balance by a hundred.
 *
 * So the ledger keeps its own registry, deliberately small, and the overlap is the
 * asset code.
 */

export interface LedgerAsset {
  /**
   * The ledger's identity for this asset, and the value stored in every balance,
   * entry and withdrawal row.
   *
   * ── One code per token *per chain* ─────────────────────────────────────────
   * `USDT_ERC20` and `USDT_TRC20` are two assets here, not one asset with two
   * networks. They are genuinely different tokens: different contracts on
   * different chains, not fungible without a bridge, and tether sent to an
   * Ethereum address over Tron is gone. A single `USDT` code made "add them up"
   * the default behaviour of every sum in the system — a balance, a portfolio
   * total, a withdrawal check — and each of those additions asserts a
   * fungibility that does not exist.
   *
   * Separating the code rather than adding a network column to `LedgerAccount`
   * is what makes combining them unrepresentable rather than merely discouraged:
   * `Money` carries the code as its currency, and `Transfer.create` already
   * refuses a set of entries that does not balance *per asset*. Two codes means
   * the domain cannot mix them even by accident.
   */
  readonly code: string;
  readonly name: string;
  /**
   * What a person calls it — `USDT` for both tethers.
   *
   * Display only, and never a key. Two assets may share a ticker, which is
   * exactly why it cannot be the identity: the row says "Tether (ERC-20)" and
   * "0 USDT", and the chain badge on the coin says the rest.
   */
  readonly ticker: string;
  /**
   * The market-data symbol that prices this asset. Defaults to `code`.
   *
   * Both tethers are quoted by the one `USDT` instrument, because a price is a
   * statement about the token's dollar value and not about which chain a
   * particular unit is sitting on. Splitting the *ledger* asset does not mean
   * inventing a second price feed for it — see `quoteSymbolOf`.
   */
  readonly quoteSymbol?: string;
  /**
   * Decimal places a balance is stored at. The protocol's own precision, not a
   * display choice: 8 for bitcoin because a satoshi is 10^-8 of one.
   */
  readonly scale: number;
  readonly networks: readonly AssetNetwork[];
  /**
   * Smallest withdrawal, as a decimal string.
   *
   * Below this the network fee is a large fraction of the amount, and the customer
   * is paying more to move it than it is worth.
   */
  readonly minimumWithdrawal: string;
}

export interface AssetNetwork {
  readonly id: string;
  readonly label: string;
  /**
   * The chain's own coin — what its fees are actually paid in.
   *
   * ── Why a network has to declare this ─────────────────────────────────────
   * A token does not pay its own way. Moving USDT on Ethereum costs ETH and
   * moving it on Tron costs TRX, because the fee belongs to the chain rather than
   * to the thing being moved. A balance of ten thousand USDT and no ETH is a
   * balance that cannot be withdrawn at all, and the customer has no way of
   * knowing that from anything else on the screen.
   *
   * For a coin on its own chain this is the asset itself — bitcoin pays bitcoin
   * miners — which is why the rule below compares rather than special-casing a
   * list of tokens.
   */
  readonly nativeAsset: string;
  /** Flat fee charged for this route, as a decimal string in the asset's units. */
  readonly fee: string;
  /** Rough time to finality, shown on the withdrawal form. */
  readonly eta: string;
  /**
   * What this chain puts in front of a transaction hash, if anything.
   *
   * `0x` on Ethereum, nothing on Bitcoin or Tron. Catalogue data rather than a
   * branch inside a formatter, because it is a fact about the chain in the same
   * way the address pattern is — and the next network added brings its own
   * convention rather than needing a special case written for it somewhere else.
   */
  readonly txHashPrefix: string;
  /**
   * A pattern the destination must match.
   *
   * Deliberately loose: this catches a truncated paste or an address for the wrong
   * chain, which is what customers actually do. It does not verify a checksum, and
   * it is not a substitute for the real thing — see `validateDestination`.
   */
  readonly addressPattern: RegExp;
}

/**
 * The market-data symbol to price this asset with.
 *
 * A function rather than a required field, so the common case — an asset quoted
 * under its own code — stays a catalogue entry with nothing extra on it.
 */
export function quoteSymbolOf(asset: LedgerAsset): string {
  return asset.quoteSymbol ?? asset.code;
}

/** True when the address looks like it belongs on this network. */
export function matchesNetwork(network: AssetNetwork, destination: string): boolean {
  return network.addressPattern.test(destination.trim());
}

/**
 * True when withdrawing this asset over this network needs a *separate* balance
 * to pay the fee with.
 *
 * False for a coin on its own chain: the fee comes out of the same asset, and the
 * balance check already covers it. True for a token on somebody else's chain,
 * where the fee is payable in a coin the customer may not hold at all.
 */
export function requiresGasToken(asset: LedgerAsset, network: AssetNetwork): boolean {
  return network.nativeAsset !== asset.code;
}
