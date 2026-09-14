CREATE TABLE "ledger"."deposit_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"scale" integer NOT NULL,
	"claimed_amount" numeric(48, 36) NOT NULL,
	"credited_amount" numeric(48, 36),
	"reference" text NOT NULL,
	"proof_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"reason" text,
	"transfer_id" text,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."deposit_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deposit_claims_status_idx" ON "ledger"."deposit_claims" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "deposit_claims_user_idx" ON "ledger"."deposit_claims" USING btree ("user_id","submitted_at");