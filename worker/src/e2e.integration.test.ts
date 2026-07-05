/**
 * True end-to-end (ROADMAP Phase 1: "enqueue a run → worker dequeues and walks a
 * 2-node DAG"): REAL BullMQ queues + workers + Postgres + Redis, from createRun
 * to run 'succeeded' with a full per-step trace.
 *
 * Gated on TEST_DATABASE_URL + TEST_REDIS_URL (CI service containers / local docker).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import IORedis from "ioredis";
import postgres from "postgres";

import {
  createRun,
  createWorkspaceLease,
  QUEUES,
  runSteps,
  schema,
  workflowRuns,
  workflows,
  type Db,
  type EngineQueues,
  type LeaseRedis,
  type StepQueue,
  type WorkflowGraph,
} from "@flowlet/shared";
import { makeStepProcessor } from "./processor";

const DB_URL = process.env.TEST_DATABASE_URL;
const REDIS_URL = process.env.TEST_REDIS_URL;
const enabled = Boolean(DB_URL && REDIS_URL);

describe.skipIf(!enabled)("e2e: enqueue → BullMQ worker walks the DAG", () => {
  const prefix = `e2e-${Date.now()}`;
  let sql: postgres.Sql;
  let db: Db;
  let connection: IORedis;
  let producers: Queue[];
  let workers: Worker[];
  let queues: EngineQueues;

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 10 });
    const dir = dirname(fileURLToPath(import.meta.url));
    await migrate(drizzle(sql), { migrationsFolder: join(dir, "..", "..", "api", "migrations") });
    db = drizzle(sql, { schema });

    connection = new IORedis(REDIS_URL!, { maxRetriesPerRequest: null });
    const runsQ = new Queue(QUEUES.RUNS, { connection, prefix });
    const aiQ = new Queue(QUEUES.AI_STEPS, { connection, prefix });
    producers = [runsQ, aiQ];
    queues = {
      runs: runsQ as unknown as StepQueue,
      aiSteps: aiQ as unknown as StepQueue,
    };

    const lease = createWorkspaceLease(connection as unknown as LeaseRedis, {
      cap: 3,
      ttlMs: 60_000,
      prefix,
    });
    const processor = makeStepProcessor({
      deps: { db, queues, stepTimeoutMs: 10_000 },
      lease,
    });
    workers = [
      new Worker(QUEUES.RUNS, processor, { connection, prefix, concurrency: 5 }),
      new Worker(QUEUES.AI_STEPS, processor, { connection, prefix, concurrency: 2 }),
    ];
    await Promise.all(workers.map((w) => w.waitUntilReady()));
  });

  afterAll(async () => {
    await Promise.all((workers ?? []).map((w) => w.close()));
    for (const q of producers ?? []) {
      await q.obliterate({ force: true }).catch(() => {});
      await q.close();
    }
    await connection?.quit();
    await sql?.end({ timeout: 5 });
  });

  it("runs a workflow end-to-end through real queues to 'succeeded' with a trace", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "T", type: "transform", config: { set: { processed: true } } },
      ],
      edges: [{ from: "A", to: "T" }],
    };
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: "00000000-0000-4000-8000-0000000000e2",
        name: "e2e",
        graph,
        enabled: true,
      })
      .returning();

    const { runId, created } = await createRun(
      { db, queues },
      { workflow: wf, triggerType: "webhook", deliveryId: "e2e-evt-1", triggerPayload: { order: 42 } }
    );
    expect(created).toBe(true);

    // Poll until the worker finishes the run (bounded).
    let status = "queued";
    for (let i = 0; i < 100 && status !== "succeeded" && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
      status = run.status;
    }
    expect(status).toBe("succeeded");

    // The trace: every node has input/output/latency recorded.
    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId));
    const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s]));
    expect(byNode.A.status).toBe("succeeded");
    expect((byNode.A.output as { value: { order: number } }).value.order).toBe(42);
    expect(byNode.T.status).toBe("succeeded");
    expect((byNode.T.output as { value: { processed: boolean } }).value.processed).toBe(true);
    expect(byNode.T.latencyMs).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
