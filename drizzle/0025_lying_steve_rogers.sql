CREATE SCHEMA "wallet_link";
--> statement-breakpoint
CREATE TABLE "wallet_link"."link_challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"domain" text NOT NULL,
	"uri" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_link"."linked_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"status" text NOT NULL,
	"connector" text NOT NULL,
	"label" text,
	"linked_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "link_challenges_expiry_idx" ON "wallet_link"."link_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "linked_wallets_user_idx" ON "wallet_link"."linked_wallets" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_wallets_unique" ON "wallet_link"."linked_wallets" USING btree ("user_id","address");