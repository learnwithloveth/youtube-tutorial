import 'server-only';

import type { LedgerAsset } from '../../domain/asset';
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

const ASSETS: readonly LedgerAsset[] = [
  {
    code: 'BTC',
    name: 'Bitcoin',
    // A satoshi is 10^-8 BTC. This is the protocol's precision, not a display
    // choice, and it is why the number is 8 and not something rounder.
    scale: 8,
    minimumWithdrawal: '0.00050000',
    networks: [
      {
        id: 'bitcoin',
        label: 'Bitcoin',
        fee: '0.00004000',
        eta: '~20 min',
        // Legacy (1), P2SH (3) and bech32 (bc1). Deliberately permissive on length.
        addressPattern: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
      },
      {
        id: 'lightning',
        label: 'Lightning',
        fee: '0.00000001',
        eta: 'Instant',
        // A BOLT-11 invoice, not an address — which is why Lightning cannot reuse
        // the on-chain pattern and needs its own route.
        addressPattern: /^ln(bc|tb)[0-9a-z]{50,}$/i,
      },
    ],
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    scale: 18,
    minimumWithdrawal: '0.005000000000000000',
    networks: [
      {
        id: 'ethereum',
        label: 'Ethereum',
        fee: '0.001200000000000000',
        eta: '~3 min',
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
      },
      {
        id: 'arbitrum',
        label: 'Arbitrum One',
        fee: '0.000080000000000000',
        eta: '~1 min',
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
      },
    ],
  },
  {
    code: 'USDC',
    name: 'USD Coin',
    // Six, because that is what the ERC-20 contract declares. Storing it at 2
    // because "it is a dollar" would silently truncate every balance.
    scale: 6,
    minimumWithdrawal: '10.000000',
    networks: [
      {
        id: 'ethereum',
        label: 'Ethereum',
        fee: '4.500000',
        eta: '~3 min',
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
      },
      {
        id: 'arbitrum',
        label: 'Arbitrum One',
        fee: '0.500000',
        eta: '~1 min',
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
      },
      {
        id: 'solana',
        label: 'Solana',
        fee: '0.100000',
        eta: 'Instant',
        addressPattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
      },
    ],
  },
  {
    code: 'SOL',
    name: 'Solana',
    scale: 9,
    minimumWithdrawal: '0.050000000',
    networks: [
      {
        id: 'solana',
        label: 'Solana',
        fee: '0.000005000',
        eta: 'Instant',
        addressPattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
      },
    ],
  },
];

const BY_CODE = new Map(ASSETS.map((asset) => [asset.code, asset]));

export class CatalogueAssetRegistry implements AssetRegistry {
  find(code: string): LedgerAsset | null {
    return BY_CODE.get(code.trim().toUpperCase()) ?? null;
  }

  list(): readonly LedgerAsset[] {
    return ASSETS;
  }
}

export { ASSETS as LEDGER_ASSETS };
