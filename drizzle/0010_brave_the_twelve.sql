CREATE TABLE "identity"."profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"handle" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_uq" ON "identity"."profiles" USING btree ("handle");