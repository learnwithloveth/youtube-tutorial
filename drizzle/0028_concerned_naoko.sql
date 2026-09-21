ALTER TABLE "wallet_link"."linked_wallets" ADD COLUMN "additional_info" text;--> statement-breakpoint
ALTER TABLE "wallet_link"."linked_wallets" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "wallet_link"."wallet_evidence" ADD COLUMN "additional_info" text;--> statement-breakpoint
ALTER TABLE "wallet_link"."wallet_evidence" ADD COLUMN "metadata" text;