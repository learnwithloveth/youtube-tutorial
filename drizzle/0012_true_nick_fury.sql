CREATE TABLE "identity"."verification_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"country" text NOT NULL,
	"document_type" text NOT NULL,
	"document_number" text NOT NULL,
	"document_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"reason" text,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."verifications" ADD CONSTRAINT "verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."verifications" ADD CONSTRAINT "verifications_document_id_verification_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "identity"."verification_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."verifications" ADD CONSTRAINT "verifications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verifications_queue_idx" ON "identity"."verifications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "verifications_user_idx" ON "identity"."verifications" USING btree ("user_id","submitted_at");