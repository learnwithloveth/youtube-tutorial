CREATE TABLE "tickers" (
	"symbol" text PRIMARY KEY NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"price_scale" integer NOT NULL,
	"change_24h_bp" integer NOT NULL,
	"change_7d_bp" integer NOT NULL,
	"market_cap" numeric(38, 2),
	"volume_24h" numeric(38, 2),
	"circulating_supply" numeric(38, 0),
	"sparkline" jsonb,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tickers_observed_at_idx" ON "tickers" USING btree ("observed_at");