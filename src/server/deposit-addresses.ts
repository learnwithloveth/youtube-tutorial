import 'server-only';

import { LEDGER_ASSETS } from '@/modules/ledger/server';
import { env } from '@/platform/env';
import { logger } from '@/platform/observability/logger';

/**
 * Where customers send funds, per asset **and network**.
 *
 * ── Keyed by the pair, not by the asset ────────────────────────────────────────
 * USDT on Ethereum and USDT on Tron are different addresses on different chains,
 * and they are not interchangeable: tether sent to an Ethereum address over Tron
 * is gone. The earlier version keyed on the asset alone, which made that mistake
 * representable — one address shown for a token that settles on two chains.
 *
 * ── Demo addresses are a mode, not a value ─────────────────────────────────────
 * Placing a fake address behind the same variable a real one uses is how a staging
 * value reaches production and customers pay into an address nobody controls. The
 * addresses are therefore accompanied by `DEPOSIT_ADDRESS_MODE`, and:
 *
 *  - `demo` makes the UI say so, loudly, on every address it shows;
 *  - `live` shows them plainly;
 *  - `demo` **in production refuses to show anything at all**.
 *
 * That last rule is the one that matters. It fails closed: a deployment that
 * forgot to swap the addresses shows an unconfigured warning rather than a
 * plausible address, and nobody loses money to a value that was never meant to
 * leave a developer's machine.
 */

export type DepositAddressMode = 'demo' | 'live';

export interface DepositAddress {
  readonly asset: string;
  readonly network: string;
  readonly address: string;
  /** True when this address must be labelled as not for real funds. */
  readonly demo: boolean;
}

/** Ledger code → ticker, so a variable name is spelled the way a person would. */
const TICKERS: ReadonlyMap<string, string> = new Map(
  LEDGER_ASSETS.map((asset) => [asset.code, asset.ticker]),
);

/** Ledger code → the networks that asset actually travels on. */
const ROUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  LEDGER_ASSETS.map((asset) => [asset.code, new Set(asset.networks.map((n) => n.id))]),
);

/**
 * The environment variable for one asset-network pair.
 *
 * `DEPOSIT_ADDRESS_<TICKER>_<NETWORK>`, e.g. `DEPOSIT_ADDRESS_USDT_TRON`. Spelled
 * out rather than parsed from a single JSON blob because a malformed blob fails
 * for every asset at once, and because one variable per pair is greppable in a
 * deployment's configuration.
 *
 * ── The ticker, not the ledger code ───────────────────────────────────────────
 * The ledger calls its two tethers `USDT_ERC20` and `USDT_TRC20`, which would give
 * `DEPOSIT_ADDRESS_USDT_ERC20_ETHEREUM` — a name that says Ethereum twice and
 * makes a deployment's configuration harder to read for no gain. The ticker plus
 * the network is already unique and already how everyone writes it:
 * `DEPOSIT_ADDRESS_USDT_ETHEREUM` and `DEPOSIT_ADDRESS_USDT_TRON`.
 *
 * That uniqueness is not a coincidence and is not luck. Two assets share a ticker
 * precisely *because* they are the same token on different chains — so they cannot
 * also share a network, or they would be the same asset. A test in the ledger's
 * catalogue pins the invariant, because the day it breaks two assets would
 * silently read one address, and an address for the wrong chain is funds gone.
 *
 * An unlisted code falls back to itself, so a catalogue and a configuration that
 * have drifted produce "no address configured" rather than a silent substitution.
 */
function variableFor(asset: string, network: string): string {
  const ticker = TICKERS.get(asset.trim().toUpperCase()) ?? asset;
  return `DEPOSIT_ADDRESS_${ticker.toUpperCase()}_${network.toUpperCase()}`;
}

function mode(): DepositAddressMode {
  return process.env.DEPOSIT_ADDRESS_MODE === 'live' ? 'live' : 'demo';
}

/**
 * The address for one asset on one network, or null.
 *
 * Null covers three cases that all mean the same thing to a customer — nothing is
 * configured, the value is empty, or demo addresses are being refused in
 * production — because the safe rendering for all three is identical: say no
 * address is available and tell them not to send anything.
 */
export function depositAddressFor(asset: string, network: string): DepositAddress | null {
  /*
   * A pairing the catalogue does not offer is refused before anything is read.
   *
   * Since the variable name is built from the *ticker*, asking for `USDT_ERC20`
   * on Tron would look up `DEPOSIT_ADDRESS_USDT_TRON` and hand back the Tron
   * address for the Ethereum asset. No caller does this today — the wallet page
   * only ever asks for an asset's own networks — but the failure it would cause
   * is a customer sending ERC-20 tether to a Tron address, which is not late
   * money, it is gone money. That is worth a guard rather than a convention.
   *
   * An unlisted code is allowed through: a configuration that is ahead of the
   * catalogue should degrade to "no address", which the lookup below already does.
   */
  const routes = ROUTES.get(asset.trim().toUpperCase());
  if (routes !== undefined && !routes.has(network.trim().toLowerCase())) {
    logger.warn({
      event: 'deposit_address_route_refused',
      module: 'ledger',
      asset,
      network,
    });
    return null;
  }

  const configured = process.env[variableFor(asset, network)]?.trim();
  if (configured === undefined || configured.length === 0) return null;

  const demo = mode() === 'demo';

  if (demo && env().NODE_ENV === 'production') {
    // Logged at error, not warn: a production deployment still holding demo
    // addresses is a misconfiguration someone needs to see, not a quiet fallback.
    logger.error({
      event: 'demo_deposit_address_refused',
      module: 'ledger',
      asset,
      network,
    });
    return null;
  }

  return { asset, network, address: configured, demo };
}

/** Every configured address for one asset, keyed by network. */
export function depositAddressesFor(
  asset: string,
  networks: readonly string[],
): Record<string, DepositAddress> {
  const found: Record<string, DepositAddress> = {};

  for (const network of networks) {
    const address = depositAddressFor(asset, network);
    if (address !== null) found[network] = address;
  }

  return found;
}

/** True when any address on this deployment is a demo value. */
export function depositAddressesAreDemo(): boolean {
  return mode() === 'demo';
}
