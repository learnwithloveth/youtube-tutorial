import 'server-only';

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

/**
 * The environment variable for one asset-network pair.
 *
 * `DEPOSIT_ADDRESS_<ASSET>_<NETWORK>`, e.g. `DEPOSIT_ADDRESS_USDT_TRON`. Spelled
 * out rather than parsed from a single JSON blob because a malformed blob fails
 * for every asset at once, and because one variable per pair is greppable in a
 * deployment's configuration.
 */
function variableFor(asset: string, network: string): string {
  return `DEPOSIT_ADDRESS_${asset.toUpperCase()}_${network.toUpperCase()}`;
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
