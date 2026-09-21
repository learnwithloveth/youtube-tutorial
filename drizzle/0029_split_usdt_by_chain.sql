-- Split USDT into one ledger asset per chain.
--
-- `USDT` was one asset with two networks, which made it one balance: a customer
-- with 100 on Tron and 100 on Ethereum had "200 USDT", a number that cannot be
-- withdrawn, cannot be sent anywhere, and describes no position anybody holds.
-- They are different contracts on unconnected chains. The catalogue now lists
-- `USDT_ERC20` and `USDT_TRC20`, and `Money` carries the code as its currency, so
-- the domain can no longer add them together even by accident.
--
-- Hand-written, not generated. `drizzle-kit` diffs *schema*, and nothing about the
-- shape of these tables changed — this is entirely a data migration, and a
-- generated diff would be empty.

-- ── Rows that carry their own chain can be split correctly ───────────────────
--
-- Withdrawals and deposit claims both record the network the movement used, so
-- each one already says which tether it was. These are decidable and are done.

UPDATE "ledger"."withdrawals"
   SET "asset" = CASE "network" WHEN 'tron' THEN 'USDT_TRC20' ELSE 'USDT_ERC20' END
 WHERE "asset" = 'USDT';
--> statement-breakpoint

UPDATE "ledger"."deposit_claims"
   SET "asset" = CASE "network" WHEN 'tron' THEN 'USDT_TRC20' ELSE 'USDT_ERC20' END
 WHERE "asset" = 'USDT';
--> statement-breakpoint

-- ── Rows that do not carry a chain cannot be split, and are not guessed ───────
--
-- `ledger.accounts` and `ledger.entries` have no network column: a USDT balance
-- was the sum of both chains and the parts are not recoverable from it. Choosing
-- one would assign somebody's money to a chain it may not be on, which is exactly
-- the fungibility this change exists to stop asserting.
--
-- So this refuses rather than guesses. It is a no-op on any deployment with no
-- USDT rows — which is the state this was written against — and on one that has
-- them it fails with an instruction instead of quietly moving money. Splitting
-- those requires reconstructing each account from its deposit and withdrawal
-- history, which is a decision with an operator's name on it, not a migration.

DO $$
DECLARE
  stranded integer;
BEGIN
  SELECT count(*) INTO stranded
    FROM "ledger"."accounts"
   WHERE "asset" = 'USDT';

  IF stranded > 0 THEN
    RAISE EXCEPTION
      'Found % ledger.accounts rows still holding the combined USDT asset. '
      'A combined balance cannot be split into USDT_ERC20 and USDT_TRC20 '
      'automatically, because the row does not record which chain the funds are '
      'on. Reconstruct each account from its deposit and withdrawal history, or '
      'move the balance deliberately, then re-run this migration.', stranded;
  END IF;

  SELECT count(*) INTO stranded
    FROM "ledger"."entries"
   WHERE "asset" = 'USDT';

  IF stranded > 0 THEN
    RAISE EXCEPTION
      'Found % ledger.entries rows still on the combined USDT asset. Entries are '
      'the evidence behind every balance and are append-only: rewriting them '
      'changes history. Resolve the accounts first.', stranded;
  END IF;
END
$$;
