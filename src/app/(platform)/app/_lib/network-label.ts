/**
 * How a chain is written, for one asset.
 *
 * ── Why the key is the pair and not the network ───────────────────────────────
 * The catalogue names the same chain differently depending on what is travelling
 * over it: Tron carrying USDT is "Tron (TRC-20)" and Tron carrying TRX is just
 * "Tron". The token standard is the part somebody has to get right when they paste
 * an address, and only the asset-and-network pairing knows it — a map keyed on the
 * network alone would tell a USDT sender "Tron", which is the label for the wrong
 * thing.
 *
 * ── Shared, because three screens ask the same question ───────────────────────
 * The statement, the wallet's reported deposits, and its withdrawals awaiting
 * approval all render a network, and all three were about to build this map for
 * themselves. Three copies of a lookup is three chances for one of them to start
 * showing the raw id.
 */

interface NetworkOption {
  readonly id: string;
  readonly label: string;
}

interface AssetWithNetworks {
  readonly code: string;
  readonly networks: readonly NetworkOption[];
}

export type NetworkLabels = ReadonlyMap<string, string>;

export function networkLabels(assets: readonly AssetWithNetworks[]): NetworkLabels {
  return new Map(
    assets.flatMap((asset) =>
      asset.networks.map((network) => [`${asset.code}:${network.id}`, network.label] as const),
    ),
  );
}

/**
 * The label, or the raw id when the pairing is unknown.
 *
 * Falling back to the id rather than to an empty string on purpose: a network this
 * catalogue has never heard of is a row written before a listing changed, and
 * `tron` on the screen is worse-looking than "Tron (TRC-20)" but still true.
 * Blanking it would lose the only chain information the row has.
 */
export function networkLabelFor(
  labels: NetworkLabels,
  asset: string,
  network: string | null,
): string | null {
  if (network === null) return null;
  return labels.get(`${asset}:${network}`) ?? network;
}
