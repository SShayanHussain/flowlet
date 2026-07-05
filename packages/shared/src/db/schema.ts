import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Flowlet execution-engine schema (owned by api/worker; imported by both).
//
// `workspace_id` is denormalized onto every table so all queries / queue keys /
// rate-limit keys are tenant-scoped without a join (PLAYBOOK §4). It is NOT a hard
// FK to `workspaces` here — that table is owned by web/'s shell schema in a
// separate migrator; tenant scoping is enforced in the app layer. Intra-engine
// FKs (run → workflow, step → run) ARE enforced.
// ---------------------------------------------------------------------------

// Design-time workflow. graph = { nodes: [{ id, type, config }], edges: [{ from, to, when? }] }.
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull(),
    graph: jsonb("graph").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    version: integer("version").notNull().default(1),
    // Unguessable inbound-webhook path token (whk_…). The public trigger URL is
    // /api/webhooks/:token — never the raw workflow id.
    webhookToken: text("webhook_token").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workflows_ws_enabled_idx").on(t.workspaceId, t.enabled)]
);

// One row per execution. Runs execute graph_snapshot (immutable), never the live workflow.graph.
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    workflowVersion: integer("workflow_version").notNull(),
    graphSnapshot: jsonb("graph_snapshot").notNull(),
    triggerType: text("trigger_type").notNull(), // 'webhook' | 'cron' | 'manual'
    triggerPayload: jsonb("trigger_payload"),
    status: text("status").notNull().default("queued"), // queued|running|succeeded|failed|canceled
    error: jsonb("error"),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("runs_wf_created_idx").on(t.workflowId, t.createdAt),
    index("runs_status_idx").on(t.status),
  ]
);

// One row per node per run — the unit of scheduling, retry, and tracing.
export const runSteps = pgTable(
  "run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    nodeId: text("node_id").notNull(),
    type: text("type").notNull(), // trigger|http|transform|ai|branch|output
    status: text("status").notNull().default("pending"), // pending|queued|running|succeeded|failed|skipped
    input: jsonb("input"),
    output: jsonb("output"),
    attempts: integer("attempts").notNull().default(0),
    latencyMs: integer("latency_ms"),
    costCents: integer("cost_cents").notNull().default(0),
    error: jsonb("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("run_steps_run_node_uq").on(t.runId, t.nodeId),
    index("run_steps_run_idx").on(t.runId),
  ]
);

// Connection credentials, encrypted at rest. Decrypted only in the worker at step time.
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    credentialsEncrypted: text("credentials_encrypted").notNull(), // base64(iv|tag|ciphertext)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("connections_ws_idx").on(t.workspaceId)]
);

// The dedupe ledger: a PK collision means "already seen" (trigger re-delivery / retried send).
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(), // 'trigger' | 'output'
  runId: uuid("run_id"),
  stepId: uuid("step_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type RunStep = typeof runSteps.$inferSelect;
export type NewRunStep = typeof runSteps.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;

// ---------------------------------------------------------------------------
// Graph shape (the jsonb in workflows.graph / workflow_runs.graph_snapshot)
// ---------------------------------------------------------------------------
export type NodeType = "trigger" | "http" | "transform" | "ai" | "branch" | "output";

export interface GraphNode {
  id: string;
  type: NodeType;
  config?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Optional guard evaluated on the source node's output (branch routing). */
  when?: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
