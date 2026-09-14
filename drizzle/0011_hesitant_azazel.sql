CREATE SCHEMA "support";
--> statement-breakpoint
CREATE TABLE "support"."attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text,
	"user_id" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attachments_uploaded_idx" ON "support"."attachments" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "support"."attachments" USING btree ("user_id");