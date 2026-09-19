-- Account numbers.
--
-- Hand-edited after generation, and this is the second migration in this
-- repository that had to be. `drizzle-kit` produced two statements:
--
--     ALTER TABLE "identity"."users" ADD COLUMN "account_number" text NOT NULL;
--     CREATE UNIQUE INDEX "users_account_number_uq" ON ...;
--
-- Correct as a diff of the schema files, and it aborts on any database that has
-- ever had a user in it: adding a NOT NULL column with no default to a populated
-- table is a constraint violation on every existing row. The schema this migration
-- arrives at is exactly the generated one — the snapshot is untouched, and
-- `drizzle-kit generate` still reports no changes against it. Only the route there
-- is different: add it nullable, fill it, then tighten.

ALTER TABLE "identity"."users" ADD COLUMN "account_number" text;--> statement-breakpoint

-- Backfill.
--
-- Every existing account needs a number that no other account has, and the
-- application's own generator cannot be used here — it draws at random and would
-- need a collision check per row, which is a loop, which is a procedure.
--
-- So the numbers are *assigned* rather than drawn, by a mapping that cannot
-- collide. `row_number()` gives each row a distinct n in 1..N. Multiplying by
-- 2654435761 modulo nine billion is a bijection on that range — the multiplier is
-- prime and shares no factor with 9,000,000,000 (= 2^9 · 3^2 · 5^9), which is the
-- condition that makes it one — so distinct inputs give distinct outputs, and no
-- two rows can land on the same number. Adding a billion lifts the result into the
-- ten-digit range with no leading zero, matching what `AccountNumber` accepts.
--
-- The multiplication is also what stops the result looking like what it is. A
-- straight `1000000000 + n` would be just as unique and would publish each
-- account's signup position on its owner's dashboard.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n
  FROM "identity"."users"
)
UPDATE "identity"."users" AS u
SET "account_number" = (1000000000 + ((numbered.n * 2654435761) % 9000000000))::text
FROM numbered
WHERE u."id" = numbered."id"
  AND u."account_number" IS NULL;--> statement-breakpoint

ALTER TABLE "identity"."users" ALTER COLUMN "account_number" SET NOT NULL;--> statement-breakpoint

-- The real arbiter. The application checks a candidate before inserting, but two
-- registrations can draw the same number between that check and the write, and
-- only this can decide which of them wins.
CREATE UNIQUE INDEX "users_account_number_uq" ON "identity"."users" USING btree ("account_number");
