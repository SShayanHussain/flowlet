/**
 * Phase 2 integration tests — real node bodies against real Postgres and a local
 * HTTP receiver. Gated on TEST_DATABASE_URL (CI service containers / local docker).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "../db/schema";
import { runSteps, workflowRuns, workflows } from "../db/schema";
import type { WorkflowGraph } from "../db/schema";
import type { StepJobData, EngineQueues } from "../queues";
import { handleCronFire } from "./cron";
import type { Db, EngineDeps } from "./deps";
import { handleStepJob } from "./executor";
import type { LlmClient } from "./llm";
import { createRun } from "./runs";

const DB_URL = process.env.TEST_DATABASE_URL;
const WS = "00000000-0000-4000-8000-000000000002";

interface ReceivedRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

/** Local HTTP receiver with scriptable status codes per path. */
function makeReceiver() {
  const received: ReceivedRequest[] = [];
  const scripts = new Map<string, number[]>(); // path → queue of statuses (then 200)
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      const queue = scripts.get(req.url!) ?? [];
      const status = queue.shift() ?? 200;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(status < 400 ? { ok: true, echo: body } : { error: "scripted" }));
    });
  });
  return { server, received, scripts };
}

function makeQueues() {
  const added: StepJobData[] = [];
  const add = async (_name: string, data: StepJobData) => {
    added.push(data);
  };
  const queues: EngineQueues = { runs: { add }, aiSteps: { add } };
  return { queues, added };
}

async function drain(deps: EngineDeps, added: StepJobData[]) {
  let cursor = 0;
  let guard = 0;
  while (cursor < added.length) {
    if (++guard > 200) throw new Error("drain did not quiesce");
    const job = added[cursor++];
    const res = await handleStepJob(deps, job, { attemptsMade: 0, maxAttempts: 3 });
    if (res.outcome === "retry") added.push(job);
  }
}

describe.skipIf(!DB_URL)("phase 2 nodes (real Postgres + local HTTP receiver)", () => {
  let sql: postgres.Sql;
  let db: Db;
  let receiver: ReturnType<typeof makeReceiver>;
  let baseUrl: string;

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 10 });
    const dir = dirname(fileURLToPath(import.meta.url));
    await migrate(drizzle(sql), {
      migrationsFolder: join(dir, "..", "..", "..", "..", "api", "migrations"),
      migrationsTable: "__drizzle_migrations_engine",
    });
    db = drizzle(sql, { schema });
    // Read-model of web/'s shell table (plan-gating reads workspaces.plan).
    await sql`CREATE TABLE IF NOT EXISTS workspaces (id uuid primary key, plan text not null default 'free')`;

    receiver = makeReceiver();
    await new Promise<void>((resolve) => receiver.server.listen(0, "127.0.0.1", resolve));
    const address = receiver.server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => receiver.server.close(resolve));
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`TRUNCATE run_steps, workflow_runs, idempotency_keys, workflows, connections, workspaces CASCADE`;
    receiver.received.length = 0;
    receiver.scripts.clear();
  });

  async function makeWorkflow(graph: WorkflowGraph, enabled = true) {
    const [wf] = await db
      .insert(workflows)
      .values({ workspaceId: WS, name: "p2", graph, enabled })
      .returning();
    return wf;
  }

  // -------------------------------------------------------------------------
  // HTTP action node: real request, templating, retry taxonomy
  // -------------------------------------------------------------------------
  it("http node POSTs templated body, retries a 503, then succeeds", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        {
          id: "H",
          type: "http",
          config: {
            url: `${baseUrl}/hooks/{{orderId}}`,
            method: "POST",
            headers: { "x-tenant": "{{tenant}}" },
            body: { order: "{{orderId}}", note: "static" },
          },
        },
      ],
      edges: [{ from: "A", to: "H" }],
    };
    const wf = await makeWorkflow(graph);
    receiver.scripts.set("/hooks/42", [503]); // first attempt fails retryably

    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues };
    const { runId } = await createRun(deps, {
      workflow: wf,
      triggerType: "manual",
      triggerPayload: { orderId: 42, tenant: "acme" },
    });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("succeeded");

    const calls = receiver.received.filter((r) => r.url === "/hooks/42");
    expect(calls).toHaveLength(2); // 503 then retry → 200
    expect(calls[1].headers["x-tenant"]).toBe("acme");
    expect(JSON.parse(calls[1].body)).toEqual({ order: "42", note: "static" });

    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId));
    const stepH = steps.find((s) => s.nodeId === "H")!;
    expect(stepH.attempts).toBe(2);
    expect((stepH.output as { value: { status: number } }).value.status).toBe(200);
  });

  it("http node fails the run terminally on a 404 (no retries)", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "H", type: "http", config: { url: `${baseUrl}/missing` } },
      ],
      edges: [{ from: "A", to: "H" }],
    };
    receiver.scripts.set("/missing", [404, 404, 404]);
    const wf = await makeWorkflow(graph);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues };
    const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("failed");
    expect(receiver.received.filter((r) => r.url === "/missing")).toHaveLength(1); // terminal, not retried
  });

  it("caches a GET connector response — second run skips the call (Phase 4)", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "H", type: "http", config: { url: `${baseUrl}/cached`, method: "GET", cacheTtlSec: 60 } },
      ],
      edges: [{ from: "A", to: "H" }],
    };
    const wf = await makeWorkflow(graph);
    const store = new Map<string, string>();
    const cache = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => void store.set(k, v),
    };

    async function runOnce() {
      const { queues, added } = makeQueues();
      const deps: EngineDeps = { db, queues, cache };
      const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
      await drain(deps, added);
      return runId;
    }

    const r1 = await runOnce();
    const r2 = await runOnce();

    // The upstream GET is hit ONCE across both runs — the second is served from cache.
    expect(receiver.received.filter((r) => r.url === "/cached")).toHaveLength(1);

    const stepsOf = (rid: string) =>
      db.select().from(runSteps).where(eq(runSteps.runId, rid)).then((rows) => rows.find((s) => s.nodeId === "H")!);
    expect(((await stepsOf(r1)).output as { cached?: boolean }).cached).toBeUndefined();
    expect(((await stepsOf(r2)).output as { cached?: boolean }).cached).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Output node: real send + idempotency-key header + release-on-clean-failure
  // -------------------------------------------------------------------------
  it("output node sends once with an Idempotency-Key and re-sends after a CLEAN failure", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "O", type: "output", config: { url: `${baseUrl}/deliver` } },
      ],
      edges: [{ from: "A", to: "O" }],
    };
    receiver.scripts.set("/deliver", [502]); // clean failure → claim released → retry re-sends
    const wf = await makeWorkflow(graph);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues };
    const { runId } = await createRun(deps, {
      workflow: wf,
      triggerType: "manual",
      triggerPayload: { msg: "hello" },
    });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("succeeded");

    const sends = receiver.received.filter((r) => r.url === "/deliver");
    expect(sends).toHaveLength(2); // 502 then successful re-send
    // Same deterministic Idempotency-Key on both attempts → receiver can dedupe.
    expect(sends[0].headers["idempotency-key"]).toBeDefined();
    expect(sends[0].headers["idempotency-key"]).toBe(sends[1].headers["idempotency-key"]);
    expect(JSON.parse(sends[1].body)).toEqual({ msg: "hello" });
  });

  // -------------------------------------------------------------------------
  // Flagship: AI step (fake LLM) → branch routes on the structured output
  // -------------------------------------------------------------------------
  it("runs trigger → ai → branch → output, routing on the AI's structured JSON", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        {
          id: "AI",
          type: "ai",
          config: {
            prompt: "Classify this ticket: {{subject}}",
            schema: {
              type: "object",
              properties: { intent: { type: "string", enum: ["refund", "escalate"] } },
              required: ["intent"],
              additionalProperties: false,
            },
          },
        },
        { id: "B", type: "branch" },
        { id: "R", type: "output", config: { url: `${baseUrl}/refunds` } },
        { id: "E", type: "output", config: { url: `${baseUrl}/escalations` } },
      ],
      edges: [
        { from: "A", to: "AI" },
        { from: "AI", to: "B" },
        { from: "B", to: "R", when: "intent == 'refund'" },
        { from: "B", to: "E", when: "intent == 'escalate'" },
      ],
    };
    const wf = await makeWorkflow(graph);

    const fakeLlm: LlmClient = {
      async generateStructured(req) {
        expect(req.prompt).toContain("Where is my money back");
        return { text: JSON.stringify({ intent: "refund" }), inputTokens: 50, outputTokens: 8, costCents: 2 };
      },
    };
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues, llm: fakeLlm };
    const { runId } = await createRun(deps, {
      workflow: wf,
      triggerType: "manual",
      triggerPayload: { subject: "Where is my money back?" },
    });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("succeeded");
    expect(run.costCents).toBe(2); // AI cost rolled up onto the run

    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId));
    const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s.status]));
    expect(byNode).toEqual({ A: "succeeded", AI: "succeeded", B: "succeeded", R: "succeeded", E: "skipped" });

    expect(receiver.received.filter((r) => r.url === "/refunds")).toHaveLength(1);
    expect(receiver.received.filter((r) => r.url === "/escalations")).toHaveLength(0);
  });

  it("fails the run when the AI step has no LLM configured (no fake results downstream)", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "AI", type: "ai", config: { prompt: "x", schema: { type: "object" } } },
        { id: "O", type: "output", config: { url: `${baseUrl}/never` } },
      ],
      edges: [
        { from: "A", to: "AI" },
        { from: "AI", to: "O" },
      ],
    };
    const wf = await makeWorkflow(graph);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues }; // no llm
    const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("failed");
    expect(receiver.received.filter((r) => r.url === "/never")).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Cron trigger: deterministic fire id dedupes double-fired ticks
  // -------------------------------------------------------------------------
  it("cron fire creates a run once per tick, skips disabled workflows", async () => {
    const graph: WorkflowGraph = {
      nodes: [{ id: "A", type: "trigger", config: { schedule: "*/5 * * * *" } }],
      edges: [],
    };
    const wf = await makeWorkflow(graph, true);
    const { queues } = makeQueues();
    const deps: EngineDeps = { db, queues };

    const fireId = `wf-${wf.id}:1700000000000`;
    const [first, second] = await Promise.all([
      handleCronFire(deps, { workflowId: wf.id }, fireId),
      handleCronFire(deps, { workflowId: wf.id }, fireId),
    ]);
    expect([first.outcome, second.outcome]).toEqual(["run-created", "run-created"]);
    const dedups = [first, second].filter(
      (o) => o.outcome === "run-created" && o.deduplicated
    );
    expect(dedups).toHaveLength(1); // double-fired tick → ONE run
    expect(await db.select().from(workflowRuns)).toHaveLength(1);

    // Next tick → a second run.
    const next = await handleCronFire(deps, { workflowId: wf.id }, `wf-${wf.id}:1700000300000`);
    expect(next.outcome).toBe("run-created");
    expect(await db.select().from(workflowRuns)).toHaveLength(2);

    // Disabled → skipped, no run.
    await db.update(workflows).set({ enabled: false }).where(eq(workflows.id, wf.id));
    const skipped = await handleCronFire(deps, { workflowId: wf.id }, `wf-${wf.id}:1700000600000`);
    expect(skipped).toEqual({ outcome: "skipped", reason: "workflow disabled" });
    expect(await db.select().from(workflowRuns)).toHaveLength(2);
  });
});
