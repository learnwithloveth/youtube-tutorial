CREATE TABLE "ac_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"path" text,
	"duration_seconds" integer,
	"location_source" text,
	"location_precision" text,
	"city" text,
	"region" text,
	"country" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"device" text,
	"browser" text,
	"ip_digest" text,
	"visitor_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ac_events_user_idx" ON "ac_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ac_events_user_kind_idx" ON "ac_events" USING btree ("user_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "ac_events_kind_time_idx" ON "ac_events" USING btree ("kind","occurred_at");