ALTER TABLE "workflows" ADD COLUMN "webhook_token" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_webhook_token_unique" UNIQUE("webhook_token");