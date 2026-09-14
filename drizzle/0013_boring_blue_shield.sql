CREATE TABLE "ledger"."risk_dispositions" (
	"key" text PRIMARY KEY NOT NULL,
	"disposition" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"note" text
);
