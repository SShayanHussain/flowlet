import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { verifyAccessToken, QUEUES, QUEUE_PREFIX, ok, err } from "./index";

describe("@flowlet/shared", () => {
  it("verifies an access token issued with the shared HS256 contract", async () => {
    process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long";
    const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

    const token = await new SignJWT({ userId: "u1", workspaceId: "w1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    const payload = await verifyAccessToken(token);
    expect(payload.userId).toBe("u1");
    expect(payload.workspaceId).toBe("w1");
  });

  it("rejects a tampered token", async () => {
    process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long";
    await expect(verifyAccessToken("not.a.jwt")).rejects.toThrow();
  });

  it("exposes the queue topology and response envelope", () => {
    expect(QUEUES.RUNS).toBe("runs");
    expect(QUEUES.AI_STEPS).toBe("ai-steps");
    expect(typeof QUEUE_PREFIX).toBe("string");
    expect(ok(1)).toEqual({ data: 1 });
    expect(err("X", "y")).toEqual({ error: { code: "X", message: "y" } });
  });
});
