/**
 * The chains a wallet may be linked from.
 *
 * ── Code, not a table ─────────────────────────────────────────────────────────
 * The same reasoning as the ledger's asset catalogue. A chain id is not editorial
 * copy that someone tunes; it is the identity of a network, and a row that got the
 * explorer URL wrong would send a customer to look up their address on the wrong
 * chain and conclude their wallet is empty. It changes when this file changes, and
 * that change is reviewable.
 *
 * ── What a chain is *not* used for here ───────────────────────────────────────
 * Nothing on this platform moves money on-chain — see `docs/architecture.md` §14,
 * "no payout broadcast". The chain is recorded because a signature proves control
 * of an address *on a network*, and because a customer with the same address on
 * two chains should see which one they connected from. It grants nothing.
 */

export interface Chain {
  readonly id: number;
  readonly name: string;
  /** The gas token's ticker. Rendered, never used to price anything. */
  readonly currency: string;
  /** Address page, with the address appended. Null where there is no public one. */
  readonly explorer: string | null;
}

/**
 * The chains recognised by name.
 *
 * Deliberately short. A wallet connected on a chain that is not here is still
 * linked and still verified — `chainOf` returns null and the console says
 * "Chain 7777", which is honest — because refusing an unknown chain id would mean
 * this list has to be complete, and it never will be.
 */
export const CHAINS: readonly Chain[] = [
  { id: 1, name: 'Ethereum', currency: 'ETH', explorer: 'https://etherscan.io/address/' },
  { id: 10, name: 'OP Mainnet', currency: 'ETH', explorer: 'https://optimistic.etherscan.io/address/' },
  { id: 56, name: 'BNB Smart Chain', currency: 'BNB', explorer: 'https://bscscan.com/address/' },
  { id: 137, name: 'Polygon', currency: 'POL', explorer: 'https://polygonscan.com/address/' },
  { id: 8453, name: 'Base', currency: 'ETH', explorer: 'https://basescan.org/address/' },
  { id: 42161, name: 'Arbitrum One', currency: 'ETH', explorer: 'https://arbiscan.io/address/' },
  { id: 43114, name: 'Avalanche', currency: 'AVAX', explorer: 'https://snowtrace.io/address/' },
  { id: 11155111, name: 'Sepolia', currency: 'ETH', explorer: 'https://sepolia.etherscan.io/address/' },
];

export function chainOf(id: number): Chain | null {
  return CHAINS.find((chain) => chain.id === id) ?? null;
}

/** "Ethereum", or "Chain 7777" for one nobody here has named. */
export function chainLabel(id: number): string {
  return chainOf(id)?.name ?? `Chain ${id}`;
}

/** The address's page on a block explorer, where one is known. */
export function explorerLink(id: number, address: string): string | null {
  const chain = chainOf(id);
  return chain?.explorer ? `${chain.explorer}${address}` : null;
}
