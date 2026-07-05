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

/** Minimal drizzle-shaped fake: every chain method returns the chain; terminal
 *  methods resolve `rows`. Enough for the route handlers' select/insert chains. */
function fakeDb(rows: unknown[] = []): Db {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "insert", "values"]) {
    chain[m] = () => chain;
  }
  chain.orderBy = () => Promise.resolve(rows);
  chain.limit = () => Promise.resolve(rows);
  chain.returning = () => Promise.resolve(rows);
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

  it("404s a webhook for an unknown/disabled workflow", async () => {
    const app = buildServer(ctx([]));
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/00000000-0000-4000-8000-000000000009",
      payload: { hello: 1 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
