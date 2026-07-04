CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"run_id" uuid,
	"step_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "run_steps_run_node_uq" UNIQUE("run_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_version" integer NOT NULL,
	"graph_snapshot" jsonb NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_payload" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" jsonb,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"graph" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_ws_idx" ON "connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "run_steps_run_idx" ON "run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "runs_ws_created_idx" ON "workflow_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_wf_created_idx" ON "workflow_runs" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_ws_enabled_idx" ON "workflows" USING btree ("workspace_id","enabled");