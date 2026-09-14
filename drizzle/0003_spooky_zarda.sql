CREATE TABLE "pr_presence" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"path" text NOT NULL,
	"path_since" timestamp with time zone NOT NULL,
	"page_views" integer DEFAULT 1 NOT NULL,
	"engagement" text DEFAULT 'engaged' NOT NULL,
	"location_source" text,
	"location_precision" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"accuracy_metres" integer,
	"city" text,
	"region" text,
	"country" text,
	"timezone" text,
	"location_observed_at" timestamp with time zone,
	"device" text,
	"browser" text,
	"ip_digest" text,
	"departed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pr_presence_last_seen_idx" ON "pr_presence" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "pr_presence_user_idx" ON "pr_presence" USING btree ("user_id","last_seen_at");