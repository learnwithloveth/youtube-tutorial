import { config } from 'dotenv';

import { and, eq, isNull } from 'drizzle-orm';

import { LEDGER_ASSETS } from '@/modules/ledger/server';
import { derivedTransactionHash } from '@/modules/ledger/domain/chain-reference';
import { transfers } from '@/modules/ledger/infrastructure/persistence/schema';
import { db } from '@/platform/db/client';

config({ path: '.env.local' });

/**
 * Gives every stored movement the chain reference it would get today.
 *
 * ── Why this is a script and not a migration ──────────────────────────────────
 * The value is a pure function of the transfer id, and that function lives in
 * TypeScript. Reimplementing FNV-1a and MurmurHash3's finaliser in PL/pgSQL to fit
 * it into a `.sql` file would mean two implementations of the one thing that must
 * never disagree — a row backfilled by SQL and the same row recomputed by the
 * application would name two different transactions.
 *
 * So the derivation stays in one place and this reads the rows out, computes, and
 * writes back. It is idempotent: only rows with no hash are touched, and the value
 * for a given transfer never changes.
 *
 * ── Run it with ───────────────────────────────────────────────────────────────
 *   pnpm ledger:backfill-hashes
 *
 * Run `pnpm db:migrate` first. This needs `transfers.tx_hash` to exist, which
 * migration 0022 adds, and reads `transfers.network`, which 0023 backfills.
 */

/** Chain prefixes by network id, from the catalogue that owns them. */
const PREFIXES = new Map(
  LEDGER_ASSETS.flatMap((asset) =>
    asset.networks.map((network) => [network.id, network.txHashPrefix] as const),
  ),
);

async function main(): Promise<void> {
  const handle = db();
  if (!handle) throw new Error('No DATABASE_URL is configured.');

  const rows = await handle
    .select({ id: transfers.id, kind: transfers.kind, network: transfers.network })
    .from(transfers)
    .where(isNull(transfers.txHash));

  if (rows.length === 0) {
    console.log('Every transfer already has a reference. Nothing to do.');
    return;
  }

  let written = 0;
  for (const row of rows) {
    // A movement with no network crossed no chain — a withdrawal fee between two
    // platform accounts. Bare hex rather than guessing a chain's convention.
    const prefix = row.network === null ? '' : (PREFIXES.get(row.network) ?? '');

    await handle
      .update(transfers)
      .set({ txHash: derivedTransactionHash(row.id, prefix) })
      .where(and(eq(transfers.id, row.id), isNull(transfers.txHash)));

    written += 1;
  }

  const [remaining] = await handle
    .select({ id: transfers.id })
    .from(transfers)
    .where(isNull(transfers.txHash))
    .limit(1);

  console.log(`Wrote ${written} reference${written === 1 ? '' : 's'}.`);
  console.log(remaining === undefined ? 'None left without one.' : 'Some rows still have none.');

}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
