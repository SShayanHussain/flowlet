/**
 * Engine integration tests (design 03 §12) — run against REAL Postgres so the
 * atomic-claim / idempotency SQL is actually exercised (approved decision D).
 *
 * Gated: skipped unless TEST_DATABASE_URL is set (CI provides service containers;
 * locally: docker compose up -d db redis + create the flowlet_test database).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "../db/schema";
import { runSteps, workflowRuns, idempotencyKeys, workflows } from "../db/schema";
import type { WorkflowGraph } from "../db/schema";
import type { StepJobData, EngineQueues } from "../queues";
import type { Db, EngineDeps } from "./deps";
import { StepError } from "./errors";
import { handleStepJob } from "./executor";
import { createRun } from "./runs";
import { createWorkspaceLease } from "./lease";

const DB_URL = process.env.TEST_DATABASE_URL;
const REDIS_URL = process.env.TEST_REDIS_URL;

const WS = "00000000-0000-4000-8000-000000000001";

// Recording fake queue — deliberately does NOT dedupe on jobId, so a double-enqueue
// bug would surface here instead of being masked by BullMQ's jobId layer.
function makeQueues() {
  const added: StepJobData[] = [];
  const add = async (_name: string, data: StepJobData) => {
    added.push(data);
  };
  const queues: EngineQueues = { runs: { add }, aiSteps: { add } };
  return { queues, added };
}

function addsFor(added: StepJobData[], nodeId: string): number {
  return added.filter((j) => j.nodeId === nodeId).length;
}

/** Deterministic "worker": process queued jobs until quiescent. */
async function drain(deps: EngineDeps, added: StepJobData[]) {
  let cursor = 0;
  let guard = 0;
  while (cursor < added.length) {
    if (++guard > 200) throw new Error("drain did not quiesce");
    const job = added[cursor++];
    const res = await handleStepJob(deps, job, { attemptsMade: 0, maxAttempts: 3 });
    if (res.outcome === "retry") added.push(job); // emulate a BullMQ retry
  }
}

describe.skipIf(!DB_URL)("engine integration (real Postgres)", () => {
  let sql: postgres.Sql;
  let db: Db;

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 10 });
    const dir = dirname(fileURLToPath(import.meta.url));
    await migrate(drizzle(sql), {
      migrationsFolder: join(dir, "..", "..", "..", "..", "api", "migrations"),
      migrationsTable: "__drizzle_migrations_engine",
    });
    db = drizzle(sql, { schema });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`TRUNCATE run_steps, workflow_runs, idempotency_keys, workflows, connections CASCADE`;
  });

  async function makeWorkflow(graph: WorkflowGraph) {
    const [wf] = await db
      .insert(workflows)
      .values({ workspaceId: WS, name: "test", graph, enabled: true })
      .returning();
    return wf;
  }

  const linear: WorkflowGraph = {
    nodes: [
      { id: "A", type: "trigger" },
      { id: "T", type: "transform", config: { set: { touched: true } } },
    ],
    edges: [{ from: "A", to: "T" }],
  };

  // -------------------------------------------------------------------------
  // §12.1 — webhook re-delivery: same delivery id → ONE run
  // -------------------------------------------------------------------------
  it("dedupes concurrent re-deliveries of the same trigger event (no double-execution)", async () => {
    const wf = await makeWorkflow(linear);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues };

    const results = await Promise.all([
      createRun(deps, { workflow: wf, triggerType: "webhook", deliveryId: "evt-1", triggerPayload: { n: 1 } }),
      createRun(deps, { workflow: wf, triggerType: "webhook", deliveryId: "evt-1", triggerPayload: { n: 1 } }),
    ]);

    const createdFlags = results.map((r) => r.created).sort();
    expect(createdFlags).toEqual([false, true]);
    expect(results[0].runId).toBe(results[1].runId);

    const runs = await db.select().from(workflowRuns);
    expect(runs).toHaveLength(1);
    expect(addsFor(added, "A")).toBe(1); // enqueued once, not twice

    await drain(deps, added);
    const [run] = await db.select().from(workflowRuns);
    expect(run.status).toBe("succeeded");
  });

  it("treats distinct delivery ids as distinct events", async () => {
    const wf = await makeWorkflow(linear);
    const { queues } = makeQueues();
    const deps: EngineDeps = { db, queues };

    const a = await createRun(deps, { workflow: wf, triggerType: "webhook", deliveryId: "evt-1" });
    const b = await createRun(deps, { workflow: wf, triggerType: "webhook", deliveryId: "evt-2" });
    expect(a.runId).not.toBe(b.runId);
    expect(await db.select().from(workflowRuns)).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // §12.2 — diamond join: concurrent B/C completion fires D exactly once
  // -------------------------------------------------------------------------
  it("executes a diamond join exactly once under concurrent predecessor completion", async () => {
    const diamond: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "B", type: "transform" },
        { id: "C", type: "transform" },
        { id: "D", type: "transform" },
      ],
      edges: [
        { from: "A", to: "B" },
        { from: "A", to: "C" },
        { from: "B", to: "D" },
        { from: "C", to: "D" },
      ],
    };
    const wf = await makeWorkflow(diamond);
    const { queues, added } = makeQueues();

    let dExecutions = 0;
    const deps: EngineDeps = {
      db,
      queues,
      executors: {
        transform: async (ctx) => {
          if (ctx.node.id === "D") dExecutions++;
          return { value: ctx.inputs };
        },
      },
    };

    const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
    // A
    await handleStepJob(deps, added[0]);
    expect(addsFor(added, "B")).toBe(1);
    expect(addsFor(added, "C")).toBe(1);

    // B and C complete CONCURRENTLY — the contended case for the join claim.
    const jobB = added.find((j) => j.nodeId === "B")!;
    const jobC = added.find((j) => j.nodeId === "C")!;
    await Promise.all([handleStepJob(deps, jobB), handleStepJob(deps, jobC)]);

    expect(addsFor(added, "D")).toBe(1); // ← the atomic pending→queued claim held

    await handleStepJob(deps, added.find((j) => j.nodeId === "D")!);
    expect(dExecutions).toBe(1);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("succeeded");
  });

  it("no-ops a duplicate step job (concurrent claim on the same node)", async () => {
    const single: WorkflowGraph = { nodes: [{ id: "A", type: "trigger" }], edges: [] };
    const wf = await makeWorkflow(single);
    const { queues, added } = makeQueues();

    let executions = 0;
    const deps: EngineDeps = {
      db,
      queues,
      executors: {
        trigger: async () => {
          executions++;
          return { value: {} };
        },
      },
    };
    await createRun(deps, { workflow: wf, triggerType: "manual" });

    const [r1, r2] = await Promise.all([handleStepJob(deps, added[0]), handleStepJob(deps, added[0])]);
    expect([r1.outcome, r2.outcome].sort()).toEqual(["completed", "not-claimable"]);
    expect(executions).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Branch routing + skipped propagation + join-after-branch
  // -------------------------------------------------------------------------
  it("routes on a branch, skips the dead subtree, and still fires the downstream join once", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "B", type: "branch" },
        { id: "C", type: "transform" },
        { id: "D", type: "transform" },
        { id: "E", type: "transform" },
      ],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "C", when: "intent == 'refund'" },
        { from: "B", to: "D", when: "intent == 'escalate'" },
        { from: "C", to: "E" },
        { from: "D", to: "E" },
      ],
    };
    const wf = await makeWorkflow(graph);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues };

    const { runId } = await createRun(deps, {
      workflow: wf,
      triggerType: "manual",
      triggerPayload: { intent: "refund" },
    });
    await drain(deps, added);

    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId));
    const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s]));
    expect(byNode.C.status).toBe("succeeded");
    expect(byNode.D.status).toBe("skipped");
    expect(byNode.E.status).toBe("succeeded");
    expect(addsFor(added, "E")).toBe(1);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("succeeded");
  });

  // -------------------------------------------------------------------------
  // Retry taxonomy: retryable retries then succeeds; terminal fails the run
  // -------------------------------------------------------------------------
  it("retries a retryable failure with attempts tracked, then succeeds", async () => {
    const wf = await makeWorkflow(linear);
    const { queues, added } = makeQueues();

    let calls = 0;
    const deps: EngineDeps = {
      db,
      queues,
      executors: {
        transform: async () => {
          if (++calls === 1) throw new StepError("transient 503", { retryable: true });
          return { value: { recovered: true } };
        },
      },
    };
    const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("succeeded");
    const [stepT] = await db
      .select()
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .then((rows) => rows.filter((s) => s.nodeId === "T"));
    expect(stepT.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("fails the run terminally and skips downstream on a non-retryable error", async () => {
    const chain: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "B", type: "transform" },
        { id: "C", type: "transform" },
      ],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ],
    };
    const wf = await makeWorkflow(chain);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = {
      db,
      queues,
      executors: {
        transform: async (ctx) => {
          if (ctx.node.id === "B") throw new StepError("bad config", { retryable: false });
          return { value: {} };
        },
      },
    };
    const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
    await drain(deps, added);

    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run.status).toBe("failed");
    expect((run.error as { nodeId: string }).nodeId).toBe("B");

    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId));
    const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s.status]));
    expect(byNode).toEqual({ A: "succeeded", B: "failed", C: "skipped" });
    expect(addsFor(added, "C")).toBe(0); // never enqueued
  });

  // -------------------------------------------------------------------------
  // Output idempotency (layer 3): a re-executed output send is suppressed
  // -------------------------------------------------------------------------
  it("suppresses a duplicate output send via the output idempotency key", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "O", type: "output" },
      ],
      edges: [{ from: "A", to: "O" }],
    };
    const wf = await makeWorkflow(graph);
    const { queues, added } = makeQueues();
    const deps: EngineDeps = { db, queues };
    const { runId } = await createRun(deps, { workflow: wf, triggerType: "manual" });
    await drain(deps, added);

    const stepO = () =>
      db
        .select()
        .from(runSteps)
        .where(eq(runSteps.runId, runId))
        .then((rows) => rows.find((s) => s.nodeId === "O")!);
    expect(((await stepO()).output as { value: { delivered: boolean } }).value.delivered).toBe(true);

    // Simulate a crash AFTER the send but BEFORE the success write: at that moment
    // the step is re-queued AND the run is still running (it never terminalized).
    await db.update(runSteps).set({ status: "queued" }).where(eq(runSteps.id, (await stepO()).id));
    await db
      .update(workflowRuns)
      .set({ status: "running", finishedAt: null })
      .where(eq(workflowRuns.id, runId));
    const res = await handleStepJob(deps, { runId, workspaceId: WS, nodeId: "O" });
    expect(res.outcome).toBe("completed");

    const output = (await stepO()).output as { value: { delivered: boolean; deduplicated?: boolean } };
    expect(output.value.delivered).toBe(false);
    expect(output.value.deduplicated).toBe(true); // second send suppressed by the key

    const keys = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.scope, "output"));
    expect(keys).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Per-workspace lease (real Redis) — fairness mechanism (design 03 §6)
// ---------------------------------------------------------------------------
describe.skipIf(!REDIS_URL)("workspace lease (real Redis)", () => {
  it("caps a tenant, frees on release, and reaps expired leases from crashed workers", async () => {
    const { default: IORedis } = await import("ioredis");
    const redis = new IORedis(REDIS_URL!);
    const prefix = `lease-test-${Date.now()}`;
    try {
      const lease = createWorkspaceLease(redis, { cap: 2, ttlMs: 250, prefix });

      expect(await lease.acquire("ws-x", "j1")).toBe(true);
      expect(await lease.acquire("ws-x", "j2")).toBe(true);
      expect(await lease.acquire("ws-x", "j3")).toBe(false); // at cap
      expect(await lease.acquire("ws-y", "j1")).toBe(true); // other tenant unaffected

      await lease.release("ws-x", "j1");
      expect(await lease.acquire("ws-x", "j3")).toBe(true); // freed slot reusable

      // Crash-safety: never released, but expires → capacity recovers.
      await new Promise((r) => setTimeout(r, 300));
      expect(await lease.acquire("ws-x", "j4")).toBe(true);
    } finally {
      await redis.quit();
    }
  });
});
