/**
 * API integration tests — real Postgres so the dashboard aggregate SQL and the
 * connection encryption round-trip are actually exercised. Gated on
 * TEST_DATABASE_URL (CI service container / local docker).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { connections, decryptCredentials, schema, workflowRuns, workflows } from "@flowlet/shared";
import type { Db, EngineQueues } from "@flowlet/shared";
import { buildServer } from "./server";

const DB_URL = process.env.TEST_DATABASE_URL;
const SECRET = "test-access-secret-at-least-32-chars-long";
const WS = "00000000-0000-4000-8000-000000000010";

async function token() {
  return new SignJWT({ userId: "u1", workspaceId: WS })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(SECRET));
}

const noQueues: EngineQueues = {
  runs: { add: async () => undefined },
  aiSteps: { add: async () => undefined },
};

describe.skipIf(!DB_URL)("api routes (real Postgres)", () => {
  let sql: postgres.Sql;
  let db: Db;
  let auth: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    process.env.CREDENTIALS_ENC_KEY = "api-integration-credentials-key";
    sql = postgres(DB_URL!, { max: 5 });
    await migrate(drizzle(sql), {
      migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"),
      migrationsTable: "__drizzle_migrations_engine",
    });
    db = drizzle(sql, { schema }) as unknown as Db;
    auth = `Bearer ${await token()}`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`TRUNCATE run_steps, workflow_runs, idempotency_keys, workflows, connections CASCADE`;
  });

  it("dashboard stats aggregate runs, rate, active workflows, and cost", async () => {
    const drizzleDb = db as unknown as ReturnType<typeof drizzle>;
    const [wf] = await drizzleDb
      .insert(workflows)
      .values({ workspaceId: WS, name: "wf", graph: { nodes: [], edges: [] }, enabled: true })
      .returning();
    await drizzleDb.insert(workflowRuns).values([
      { workflowId: wf.id, workspaceId: WS, workflowVersion: 1, graphSnapshot: {}, triggerType: "manual", status: "succeeded", costCents: 30 },
      { workflowId: wf.id, workspaceId: WS, workflowVersion: 1, graphSnapshot: {}, triggerType: "manual", status: "succeeded", costCents: 20 },
      { workflowId: wf.id, workspaceId: WS, workflowVersion: 1, graphSnapshot: {}, triggerType: "manual", status: "failed", error: { message: "boom" } },
    ]);

    const app = buildServer({ db, queues: noQueues });
    const res = await app.inject({ method: "GET", url: "/api/dashboard/stats", headers: { authorization: auth } });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.runsToday).toBe(3);
    expect(d.successRate).toBe(67); // 2/3
    expect(d.activeWorkflows).toBe(1);
    expect(d.costCentsThisMonth).toBe(50);
    expect(d.recentFailures).toHaveLength(1);
    expect(d.recentFailures[0].workflowName).toBe("wf");
    await app.close();
  });

  it("connection create encrypts at rest and never returns the secret", async () => {
    const app = buildServer({ db, queues: noQueues });
    const res = await app.inject({
      method: "POST",
      url: "/api/connections",
      headers: { authorization: auth },
      payload: { name: "Stripe", type: "http", credentials: { headers: { authorization: "Bearer sk_live_x" } } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).not.toContain("sk_live_x");

    // Stored ciphertext decrypts back to the original (worker-side round-trip).
    const [row] = await (db as unknown as ReturnType<typeof drizzle>)
      .select()
      .from(connections)
      .where(eq(connections.workspaceId, WS));
    expect(row.credentialsEncrypted).not.toContain("sk_live_x");
    expect(decryptCredentials(row.credentialsEncrypted)).toEqual({ headers: { authorization: "Bearer sk_live_x" } });

    // List never includes credentials.
    const list = await app.inject({ method: "GET", url: "/api/connections", headers: { authorization: auth } });
    expect(list.body).not.toContain("credentialsEncrypted");
    expect(list.json().data.connections).toHaveLength(1);
    await app.close();
  });

  it("enriches the workflow list with 30-day run/cost stats (cost-per-workflow)", async () => {
    const drizzleDb = db as unknown as ReturnType<typeof drizzle>;
    const [wf] = await drizzleDb
      .insert(workflows)
      .values({ workspaceId: WS, name: "priced", graph: { nodes: [], edges: [] }, enabled: true })
      .returning();
    await drizzleDb.insert(workflowRuns).values([
      { workflowId: wf.id, workspaceId: WS, workflowVersion: 1, graphSnapshot: {}, triggerType: "manual", status: "succeeded", costCents: 12 },
      { workflowId: wf.id, workspaceId: WS, workflowVersion: 1, graphSnapshot: {}, triggerType: "manual", status: "failed" },
    ]);

    const app = buildServer({ db, queues: noQueues });
    const res = await app.inject({ method: "GET", url: "/api/workflows", headers: { authorization: auth } });
    expect(res.statusCode).toBe(200);
    const [row] = res.json().data.workflows;
    expect(row.stats.runs30d).toBe(2);
    expect(row.stats.successRate).toBe(50);
    expect(row.stats.costCents30d).toBe(12);
    await app.close();
  });
});
