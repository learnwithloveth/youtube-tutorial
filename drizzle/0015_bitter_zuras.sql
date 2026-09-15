CREATE SCHEMA "alerts";
--> statement-breakpoint
CREATE TABLE "alerts"."notification_reads" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts"."price_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"target" numeric(38, 8) NOT NULL,
	"status" text DEFAULT 'armed' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"triggered_at" timestamp with time zone,
	"triggered_price" numeric(38, 8),
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "price_alerts_user_idx" ON "alerts"."price_alerts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "price_alerts_armed_idx" ON "alerts"."price_alerts" USING btree ("status","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "price_alerts_unique" ON "alerts"."price_alerts" USING btree ("user_id","symbol","direction","target");