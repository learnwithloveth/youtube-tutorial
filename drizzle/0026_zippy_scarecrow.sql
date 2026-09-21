CREATE TABLE "wallet_link"."wallet_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_link"."linked_wallets" ADD COLUMN "evidence_id" text;--> statement-breakpoint
ALTER TABLE "wallet_link"."linked_wallets" ADD COLUMN "evidence_at" timestamp with time zone;