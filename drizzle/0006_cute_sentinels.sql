CREATE SCHEMA "ledger";
--> statement-breakpoint
CREATE TABLE "ledger"."accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"asset" text NOT NULL,
	"scale" integer NOT NULL,
	"balance" numeric(48, 36) DEFAULT '0' NOT NULL,
	"held" numeric(48, 36) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."entries" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"account_id" text NOT NULL,
	"asset" text NOT NULL,
	"delta" numeric(48, 36) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"reference" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."withdrawal_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"withdrawal_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset" text NOT NULL,
	"scale" integer NOT NULL,
	"amount" numeric(48, 36) NOT NULL,
	"fee" numeric(48, 36) NOT NULL,
	"network" text NOT NULL,
	"destination" text NOT NULL,
	"valued_at_usd" numeric(38, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"reason" text,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD CONSTRAINT "entries_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "ledger"."transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD CONSTRAINT "entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "ledger"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."withdrawal_approvals" ADD CONSTRAINT "withdrawal_approvals_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "ledger"."withdrawals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_owner_idx" ON "ledger"."accounts" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_owner_asset_uq" ON "ledger"."accounts" USING btree ("owner_kind","owner_id","asset");--> statement-breakpoint
CREATE INDEX "entries_account_idx" ON "ledger"."entries" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "entries_transfer_idx" ON "ledger"."entries" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "transfers_occurred_idx" ON "ledger"."transfers" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_approvals_once_uq" ON "ledger"."withdrawal_approvals" USING btree ("withdrawal_id","operator_id");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "ledger"."withdrawals" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "withdrawals_user_idx" ON "ledger"."withdrawals" USING btree ("user_id","requested_at");