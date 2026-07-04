import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
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

describe("api server", () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = SECRET;
  });

  it("GET /health returns ok", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.service).toBe("api");
    await app.close();
  });

  it("GET /api/workflows rejects a missing token (401)", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/workflows" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    await app.close();
  });

  it("GET /api/workflows accepts a valid token and is tenant-scoped", async () => {
    const app = buildServer();
    const token = await makeToken();
    const res = await app.inject({
      method: "GET",
      url: "/api/workflows",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.workspaceId).toBe("w1");
    await app.close();
  });
});
