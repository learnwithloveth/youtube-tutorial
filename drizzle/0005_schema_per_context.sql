-- Schema-per-bounded-context.
--
-- Hand-written, and it has to be. A generated diff sees `public.id_users` disappear
-- and `identity.users` appear, and expresses that as DROP + CREATE — which is
-- correct as a diff and catastrophic as a migration, since the whole point of this
-- change is that every row survives it.
--
-- `ALTER TABLE ... SET SCHEMA` moves the table with its indexes, constraints,
-- defaults and foreign keys intact. No data is copied and nothing is rewritten;
-- Postgres updates catalogue entries. The renames that follow are cosmetic in the
-- database and load-bearing in the codebase: Drizzle tracks index and constraint
-- names in its snapshot, so leaving them as `id_users_email_uq` would make the very
-- next generated migration try to drop and recreate every index.
--
-- Reversible: every statement here has an exact inverse. See the note at the end.

CREATE SCHEMA IF NOT EXISTS "identity";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "presence";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "activity";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "market_data";
--> statement-breakpoint

-- ── identity ────────────────────────────────────────────────────────────────────
-- Users first: the other two carry foreign keys to it. Postgres does not require
-- the order (constraints follow their tables either way), but reading the file in
-- dependency order is how a reviewer checks that nothing was left behind.
ALTER TABLE "public"."id_users" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "identity"."id_users" RENAME TO "users";
--> statement-breakpoint
ALTER INDEX "identity"."id_users_email_uq" RENAME TO "users_email_uq";
--> statement-breakpoint

ALTER TABLE "public"."id_sessions" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "identity"."id_sessions" RENAME TO "sessions";
--> statement-breakpoint
ALTER INDEX "identity"."id_sessions_user_idx" RENAME TO "sessions_user_idx";
--> statement-breakpoint
ALTER INDEX "identity"."id_sessions_expires_idx" RENAME TO "sessions_expires_idx";
--> statement-breakpoint
ALTER TABLE "identity"."sessions"
  RENAME CONSTRAINT "id_sessions_user_id_id_users_id_fk" TO "sessions_user_id_users_id_fk";
--> statement-breakpoint

ALTER TABLE "public"."id_verification_tokens" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "identity"."id_verification_tokens" RENAME TO "verification_tokens";
--> statement-breakpoint
ALTER INDEX "identity"."id_verification_tokens_hash_uq" RENAME TO "verification_tokens_hash_uq";
--> statement-breakpoint
ALTER INDEX "identity"."id_verification_tokens_user_idx" RENAME TO "verification_tokens_user_idx";
--> statement-breakpoint
ALTER INDEX "identity"."id_verification_tokens_expires_idx" RENAME TO "verification_tokens_expires_idx";
--> statement-breakpoint
ALTER TABLE "identity"."verification_tokens"
  RENAME CONSTRAINT "id_verification_tokens_user_id_id_users_id_fk" TO "verification_tokens_user_id_users_id_fk";
--> statement-breakpoint

-- ── presence ────────────────────────────────────────────────────────────────────
-- `visitors`, not `presence`: a row is one browsing context keyed by a VisitorId,
-- and `presence.presence` would have said nothing.
ALTER TABLE "public"."pr_presence" SET SCHEMA "presence";
--> statement-breakpoint
ALTER TABLE "presence"."pr_presence" RENAME TO "visitors";
--> statement-breakpoint
ALTER INDEX "presence"."pr_presence_last_seen_idx" RENAME TO "visitors_last_seen_idx";
--> statement-breakpoint
ALTER INDEX "presence"."pr_presence_user_idx" RENAME TO "visitors_user_idx";
--> statement-breakpoint

-- ── activity ────────────────────────────────────────────────────────────────────
ALTER TABLE "public"."ac_events" SET SCHEMA "activity";
--> statement-breakpoint
ALTER TABLE "activity"."ac_events" RENAME TO "events";
--> statement-breakpoint
ALTER INDEX "activity"."ac_events_user_idx" RENAME TO "events_user_idx";
--> statement-breakpoint
ALTER INDEX "activity"."ac_events_user_kind_idx" RENAME TO "events_user_kind_idx";
--> statement-breakpoint
ALTER INDEX "activity"."ac_events_kind_time_idx" RENAME TO "events_kind_time_idx";
--> statement-breakpoint

-- ── market_data ─────────────────────────────────────────────────────────────────
-- The table keeps its name; only its home changes. It moved out of `platform/db`
-- in the same commit — the shared foundation was never its owner.
ALTER TABLE "public"."tickers" SET SCHEMA "market_data";

-- ── Rolling this back ───────────────────────────────────────────────────────────
-- Reverse the file: rename each index and constraint to its old name, rename each
-- table back, `SET SCHEMA "public"`, then `DROP SCHEMA` the four namespaces (they
-- will be empty). No data is at risk in either direction, because no statement here
-- moves a row.
