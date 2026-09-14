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
  readonly code: string;
  readonly name: string;
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
  /** Flat fee charged for this route, as a decimal string in the asset's units. */
  readonly fee: string;
  /** Rough time to finality, shown on the withdrawal form. */
  readonly eta: string;
  /**
   * A pattern the destination must match.
   *
   * Deliberately loose: this catches a truncated paste or an address for the wrong
   * chain, which is what customers actually do. It does not verify a checksum, and
   * it is not a substitute for the real thing — see `validateDestination`.
   */
  readonly addressPattern: RegExp;
}

/** True when the address looks like it belongs on this network. */
export function matchesNetwork(network: AssetNetwork, destination: string): boolean {
  return network.addressPattern.test(destination.trim());
}
