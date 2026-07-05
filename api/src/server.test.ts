import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import type { Db, EngineQueues } from "@flowlet/shared";
import { buildServer } from "./server";

const SECRET = "test-access-secret-at-least-32-chars-long";

async function makeToken() {
  return new SignJWT({ userId: "u1", workspaceId: "w1" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(SECRET));
}

/** Minimal drizzle-shaped fake: every builder method returns the (thenable)
 *  chain, so awaiting at any terminal (`.limit()`, `.returning()`, `.orderBy()`,
 *  `.execute()`, or a bare `.where()`) resolves the same `rows`. Enough for the
 *  route handlers' select/insert/update/delete chains; multi-query handlers
 *  (dashboard, createRun transactions) are covered by the integration suite. */
function fakeDb(rows: unknown[] = []): Db {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "from", "where", "innerJoin", "insert", "values",
    "update", "set", "delete", "orderBy", "limit", "returning", "execute",
  ];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain as unknown as Db;
}

const noQueues: EngineQueues = {
  runs: { add: async () => undefined },
  aiSteps: { add: async () => undefined },
};

function ctx(rows: unknown[] = []) {
  return { db: fakeDb(rows), queues: noQueues };
}

describe("api server", () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = SECRET;
  });

  it("GET /health returns ok", async () => {
    const app = buildServer(ctx());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.service).toBe("api");
    await app.close();
  });

  it("rejects a missing token on protected routes (401)", async () => {
    const app = buildServer(ctx());
    const res = await app.inject({ method: "GET", url: "/api/workflows" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    await app.close();
  });

  it("lists workflows for a valid token", async () => {
    const app = buildServer(ctx([{ id: "wf-1", name: "test" }]));
    const res = await app.inject({
      method: "GET",
      url: "/api/workflows",
      headers: { authorization: `Bearer ${await makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.workflows).toHaveLength(1);
    await app.close();
  });

  it("rejects an invalid graph on create (400, before any DB access)", async () => {
    // db deliberately unusable — validation must run first.
    const app = buildServer({ db: undefined as unknown as Db, queues: noQueues });
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { authorization: `Bearer ${await makeToken()}` },
      payload: {
        name: "cyclic",
        graph: {
          nodes: [
            { id: "A", type: "trigger" },
            { id: "B", type: "transform" },
          ],
          edges: [
            { from: "A", to: "B" },
            { from: "B", to: "A" },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_GRAPH");
    await app.close();
  });

  it("creates a workflow with a valid graph (201)", async () => {
    const app = buildServer(ctx([{ id: "wf-1", name: "ok" }]));
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { authorization: `Bearer ${await makeToken()}` },
      payload: {
        name: "ok",
        graph: { nodes: [{ id: "A", type: "trigger" }], edges: [] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.workflow.id).toBe("wf-1");
    await app.close();
  });

  it("404s a webhook with a malformed token before touching the DB", async () => {
    // db unusable on purpose — the token-shape check must run first.
    const app = buildServer({ db: undefined as unknown as Db, queues: noQueues });
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/00000000-0000-4000-8000-000000000009", // raw ids are not tokens
      payload: { hello: 1 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("404s a well-formed token that matches no enabled workflow", async () => {
    const app = buildServer(ctx([]));
    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/whk_${"ab".repeat(24)}`,
      payload: { hello: 1 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("rejects an invalid graph on update (400)", async () => {
    const app = buildServer(ctx([{ id: "wf-1", workspaceId: "w1" }]));
    const res = await app.inject({
      method: "PATCH",
      url: "/api/workflows/wf-1",
      headers: { authorization: `Bearer ${await makeToken()}` },
      payload: {
        graph: { nodes: [{ id: "A", type: "trigger" }], edges: [{ from: "A", to: "ghost" }] },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_GRAPH");
    await app.close();
  });

  it("duplicates a workflow as a disabled copy (201)", async () => {
    const app = buildServer(ctx([{ id: "wf-2", name: "test (copy)", enabled: false }]));
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows/wf-1/duplicate",
      headers: { authorization: `Bearer ${await makeToken()}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.workflow.enabled).toBe(false);
    await app.close();
  });

  it("404s deleting a workflow in another workspace", async () => {
    const app = buildServer(ctx([])); // returning() → [] → not found
    const res = await app.inject({
      method: "DELETE",
      url: "/api/workflows/wf-x",
      headers: { authorization: `Bearer ${await makeToken()}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("lists runs for the workspace", async () => {
    const app = buildServer(ctx([{ id: "run-1", status: "succeeded" }]));
    const res = await app.inject({
      method: "GET",
      url: "/api/runs?limit=10",
      headers: { authorization: `Bearer ${await makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.runs).toHaveLength(1);
    await app.close();
  });

  it("requires name/type/credentials to create a connection (400)", async () => {
    const app = buildServer({ db: undefined as unknown as Db, queues: noQueues });
    const res = await app.inject({
      method: "POST",
      url: "/api/connections",
      headers: { authorization: `Bearer ${await makeToken()}` },
      payload: { name: "only-name" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("creates a connection and never echoes credentials back", async () => {
    process.env.CREDENTIALS_ENC_KEY = "test-connection-key-please-change";
    const app = buildServer(ctx([{ id: "conn-1", type: "http", name: "Stripe" }]));
    const res = await app.inject({
      method: "POST",
      url: "/api/connections",
      headers: { authorization: `Bearer ${await makeToken()}` },
      payload: { name: "Stripe", type: "http", credentials: { apiKey: "sk_live_secret" } },
    });
    expect(res.statusCode).toBe(201);
    const bodyText = res.body;
    expect(bodyText).not.toContain("sk_live_secret");
    expect(bodyText).not.toContain("credentialsEncrypted");
    expect(res.json().data.connection.id).toBe("conn-1");
    await app.close();
  });
});
