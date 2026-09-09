-- Identity: users, sessions, and email verification tokens.
--
-- Hand-edited after generation to be idempotent. The generator diffs against this
-- branch's own migration history, which does not know that `id_users` and
-- `id_sessions` may already exist: the shared development database was migrated
-- from another branch that introduced them with an identical definition. A plain
-- CREATE TABLE aborts the whole migration on "already exists", leaving the genuinely
-- new table — id_verification_tokens — uncreated.
--
-- IF NOT EXISTS makes this correct in both directions: it creates everything on a
-- fresh database, and adds only what is missing on one that has been here before.
-- The constraint blocks need DO wrappers because ADD CONSTRAINT has no IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "id_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "id_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent_hash" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "id_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "id_sessions" ADD CONSTRAINT "id_sessions_user_id_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."id_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "id_verification_tokens" ADD CONSTRAINT "id_verification_tokens_user_id_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."id_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "id_sessions_user_idx" ON "id_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "id_sessions_expires_idx" ON "id_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "id_users_email_uq" ON "id_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "id_verification_tokens_hash_uq" ON "id_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "id_verification_tokens_user_idx" ON "id_verification_tokens" USING btree ("user_id","purpose","consumed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "id_verification_tokens_expires_idx" ON "id_verification_tokens" USING btree ("expires_at");
