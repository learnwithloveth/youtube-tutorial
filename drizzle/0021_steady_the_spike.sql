ALTER TABLE "ledger"."deposit_claims" ADD COLUMN "confirming_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ledger"."deposit_claims" ADD COLUMN "confirming_by" text;--> statement-breakpoint
ALTER TABLE "ledger"."deposit_claims" ADD COLUMN "confirming_note" text;