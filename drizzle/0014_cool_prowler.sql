CREATE SCHEMA "announcements";
--> statement-breakpoint
CREATE TABLE "announcements"."announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"surface" text NOT NULL,
	"tone" text DEFAULT 'info' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "announcements_surface_idx" ON "announcements"."announcements" USING btree ("surface","status","publish_at");--> statement-breakpoint
CREATE INDEX "announcements_updated_idx" ON "announcements"."announcements" USING btree ("updated_at");