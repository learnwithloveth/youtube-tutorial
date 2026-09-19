-- Backfill: which chain each existing movement happened on.
--
-- Hand-written, and it changes no schema at all — `0022` added
-- `ledger.transfers.network` and `tx_hash` as nullable columns and left every
-- existing row null, which is the correct way to add a column and the wrong place
-- to stop. Those rows are not unknowable: the chain is recorded elsewhere for most
-- of them, and a statement that says "we don't know" about a movement whose
-- network is sitting in the next table is worse than one that never asked.
--
-- It matters more than it looks. USDT is the asset with no chain-less form: the
-- only Tether logos this application ships are USDT-on-Ethereum and USDT-on-Tron,
-- so a row with no network renders as a lettered mark rather than as either. The
-- point of that design is that a mark never names a chain nobody recorded — and
-- the fix for a row whose chain *was* recorded is to go and get it.

-- 1. Deposits, from the claim that produced them.
--
-- Exact: `deposit_claims.transfer_id` is written by the approval itself, so this
-- is a foreign key in everything but name. The customer's own transaction hash
-- comes across in the same pass, where they gave one — an empty reference stays
-- null rather than becoming an empty string.
UPDATE "ledger"."transfers" AS t
SET "network" = c."network",
    "tx_hash" = NULLIF(TRIM(c."reference"), '')
FROM "ledger"."deposit_claims" AS c
WHERE c."transfer_id" = t."id"
  AND t."network" IS NULL;--> statement-breakpoint

-- 2. Withdrawals, from the request they settled.
--
-- The reference is written as `withdrawal <id>` by `decideWithdrawal` and by
-- nothing else, so matching on it is exact for every row this codebase wrote.
-- `tx_hash` is deliberately left alone: this platform's payout path ends at
-- `payable` and broadcasts nothing, so there is no transaction to name and never
-- was one.
UPDATE "ledger"."transfers" AS t
SET "network" = w."network"
FROM "ledger"."withdrawals" AS w
WHERE t."reference" = 'withdrawal ' || w."id"
  AND t."network" IS NULL;--> statement-breakpoint

-- 3. Demo credits, from the words in their own reference.
--
-- The one place here that reads a human-readable string, and the only place it is
-- defensible: these rows have no record behind them to join to — a demo grant is a
-- bare transfer — and the reference was written by one function in one format,
-- `demo funds on <network> …`. The regex anchors on that whole prefix rather than
-- hunting for a chain name anywhere in the line, so a note that happens to mention
-- Tron cannot be mistaken for the network.
--
-- Grants written before the network was recorded at all read `demo funds by …`
-- with no chain in them. Those match nothing and stay null, which is the honest
-- outcome: nobody recorded it, so nobody can say.
UPDATE "ledger"."transfers"
SET "network" = SUBSTRING("reference" FROM '^demo funds on ([a-z]+)[ (]')
WHERE "kind" = 'demo-credit'
  AND "network" IS NULL
  AND "reference" ~ '^demo funds on [a-z]+[ (]';
