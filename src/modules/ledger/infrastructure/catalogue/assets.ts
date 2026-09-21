import 'server-only';

import { quoteSymbolOf, type LedgerAsset } from '../../domain/asset';
import type { AssetRegistry } from '../../application/ports';

/**
 * The assets this platform will custody, and how.
 *
 * ── Code, not a table ──────────────────────────────────────────────────────────
 * Same reasoning as market-data's instrument catalogue. An asset's *storage scale*
 * is not data that changes — it is the definition of what the integer in the
 * balance column means, and changing it is a migration that rewrites every row, not
 * an `UPDATE`. Putting it in a table would make the most dangerous value in the
 * system editable by anyone with database access and no migration.
 *
 * Networks and fees are here for a weaker reason: they change rarely, they are
 * reviewed when they do, and a fee schedule in code is one a reviewer sees in the
 * diff. A fee table would be the right move once fees vary by tier or by time of
 * day; until then it would be indirection for its own sake.
 *
 * ── The address patterns are a guard rail, not validation ──────────────────────
 * They catch the mistake customers actually make — an address for the wrong chain,
 * or a truncated paste — and they do not verify a checksum. Real address validation
 * is chain-specific (bech32 for bitcoin, EIP-55 for ethereum) and belongs behind a
 * library at the point a broadcast is attempted. These stop the obvious errors at
 * the form, where a person can still fix them.
 */

/**
 * A Tron base58 address.
 *
 * Always begins `T` and is 34 characters. The alphabet excludes `0`, `O`, `I` and
 * `l`, which is the point of base58 — the characters a person cannot tell apart
 * when reading an address aloud or off a screen are simply not in it.
 *
 * Mainnet and testnet share this format, so unlike bitcoin there is no structural
 * guard against pasting a testnet address here. That is one reason the demo
 * addresses are labelled in the UI rather than trusted to be obviously wrong.
 */
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

const ASSETS: readonly LedgerAsset[] = [
  {
    code: 'BTC',
    ticker: 'BTC',
    name: 'Bitcoin',
    // A satoshi is 10^-8 BTC. This is the protocol's precision, not a display
    // choice, and it is why the number is 8 and not something rounder.
    scale: 8,
    minimumWithdrawal: '0.00050000',
    networks: [
      {
        id: 'bitcoin',
        label: 'Bitcoin',
        nativeAsset: 'BTC',
        fee: '0.00004000',
        eta: '~20 min',
        // A txid is written as bare hex, big-endian, with no prefix.
        txHashPrefix: '',
        // Legacy (1), P2SH (3) and bech32 (bc1). Deliberately permissive on length.
        addressPattern: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
      },
      {
        id: 'lightning',
        label: 'Lightning',
        nativeAsset: 'BTC',
        fee: '0.00000001',
        eta: 'Instant',
        // A payment hash, and bare hex like a txid.
        txHashPrefix: '',
        // A BOLT-11 invoice, not an address — which is why Lightning cannot reuse
        // the on-chain pattern and needs its own route.
        addressPattern: /^ln(bc|tb)[0-9a-z]{50,}$/i,
      },
    ],
  },
  {
    code: 'ETH',
    ticker: 'ETH',
    name: 'Ethereum',
    scale: 18,
    minimumWithdrawal: '0.005000000000000000',
    networks: [
      {
        id: 'ethereum',
        label: 'Ethereum',
        nativeAsset: 'ETH',
        fee: '0.001200000000000000',
        eta: '~3 min',
        // Ethereum writes its hashes with an 0x prefix, as it does everything.
        txHashPrefix: '0x',
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
      },
    ],
  },
  /*
   * ── Two tethers, and they are never added together ───────────────────────────
   * USDT on Ethereum and USDT on Tron were one catalogue row with two networks.
   * That made them one balance: a customer with 100 on Tron and 100 on Ethereum
   * had "200 USDT", a number that cannot be withdrawn, cannot be sent anywhere,
   * and describes no position anybody holds. They are different ERC-20 and TRC-20
   * contracts on unconnected chains, and moving value between them needs a bridge
   * and a counterparty.
   *
   * Separate `code`s make the ledger itself refuse to mix them — `Money` carries
   * the code as its currency and `Transfer.create` balances per currency — so the
   * separation holds in the database, in every sum, and in every screen, rather
   * than depending on each caller remembering to group by network.
   *
   * They share a `ticker` and a `quoteSymbol` because both are still tether:
   * a person calls both "USDT", and one price feed quotes both. What they do not
   * share is a balance.
   */
  {
    code: 'USDT_ERC20',
    ticker: 'USDT',
    name: 'Tether (ERC-20)',
    quoteSymbol: 'USDT',
    // Six, because that is what the contract declares. The Tron contract happens
    // to declare six as well; that is luck rather than a rule, and the two rows
    // are free to disagree now that they are two rows.
    scale: 6,
    minimumWithdrawal: '10.000000',
    networks: [
      {
        id: 'ethereum',
        label: 'Ethereum (ERC-20)',
        // Gas is ETH. A customer holding only USDT cannot move it — see
        // `requiresGasToken`.
        nativeAsset: 'ETH',
        fee: '6.000000',
        eta: '~3 min',
        // Ethereum writes its hashes with an 0x prefix, as it does everything.
        txHashPrefix: '0x',
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
      },
    ],
  },
  {
    code: 'USDT_TRC20',
    ticker: 'USDT',
    name: 'Tether (TRC-20)',
    quoteSymbol: 'USDT',
    scale: 6,
    minimumWithdrawal: '10.000000',
    networks: [
      {
        id: 'tron',
        label: 'Tron (TRC-20)',
        // Energy and bandwidth are paid in TRX, whoever is sending what.
        nativeAsset: 'TRX',
        // A fraction of the Ethereum fee, which is why most USDT settles here.
        fee: '1.000000',
        eta: '~1 min',
        // Tron writes its transaction ids as bare hex, like Bitcoin.
        txHashPrefix: '',
        addressPattern: TRON_ADDRESS,
      },
    ],
  },
  {
    code: 'TRX',
    ticker: 'TRX',
    name: 'TRON',
    // TRON calls the smallest unit a SUN: 10^-6 TRX.
    scale: 6,
    minimumWithdrawal: '10.000000',
    networks: [
      {
        id: 'tron',
        label: 'Tron',
        nativeAsset: 'TRX',
        fee: '1.100000',
        eta: '~1 min',
        // Tron writes its transaction ids as bare hex, like Bitcoin.
        txHashPrefix: '',
        addressPattern: TRON_ADDRESS,
      },
    ],
  },
];

const BY_CODE = new Map(ASSETS.map((asset) => [asset.code, asset]));

/**
 * The bare ticker no longer identifies an asset, and asking for one is a bug.
 *
 * `USDT` was a valid code until the two tethers were split. Anything still
 * passing it — a stored row, a hand-written request, a screen that was not
 * updated — is ambiguous rather than merely unknown, and answering with either
 * chain would silently pick one. `find` returns null for it like any other
 * unlisted code; this list exists so the log line says which mistake it was.
 */
const RETIRED_CODES: ReadonlySet<string> = new Set(['USDT']);

export function isRetiredAssetCode(code: string): boolean {
  return RETIRED_CODES.has(code.trim().toUpperCase());
}

/**
 * The market symbol that prices a ledger asset code.
 *
 * Both tethers resolve to `USDT`. An unrecognised code is handed back unchanged,
 * so a caller looking it up in market-data gets "no such market" rather than a
 * silent substitution.
 */
export function quoteSymbolForAsset(code: string): string {
  const normalised = code.trim().toUpperCase();
  const asset = BY_CODE.get(normalised);
  return asset === undefined ? normalised : quoteSymbolOf(asset);
}

export class CatalogueAssetRegistry implements AssetRegistry {
  find(code: string): LedgerAsset | null {
    return BY_CODE.get(code.trim().toUpperCase()) ?? null;
  }

  list(): readonly LedgerAsset[] {
    return ASSETS;
  }
}

export { ASSETS as LEDGER_ASSETS };
