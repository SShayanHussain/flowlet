import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll mock the database since we are doing unit tests
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "@/lib/auth/tokens";

describe("Auth Core", () => {
  describe("Passwords", () => {
    it("should hash and verify passwords correctly", async () => {
      const plain = "mySecretPassword123!";
      const hash = await hashPassword(plain);
      
      expect(hash).not.toBe(plain);
      
      const isValid = await verifyPassword(plain, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await verifyPassword("wrongPassword", hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe("Tokens", () => {
    const payload = { userId: "user-123", workspaceId: "workspace-456" };
    
    beforeEach(() => {
      process.env.JWT_ACCESS_SECRET = "test-access-secret";
      process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
      process.env.JWT_ACCESS_TTL = "900";
      process.env.JWT_REFRESH_TTL = "1209600";
    });

    it("should sign and verify access tokens", async () => {
      const token = await signAccessToken(payload);
      expect(typeof token).toBe("string");
      
      const decoded = await verifyAccessToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.workspaceId).toBe(payload.workspaceId);
    });

    it("should sign and verify refresh tokens", async () => {
      const token = await signRefreshToken(payload);
      expect(typeof token).toBe("string");
      
      const decoded = await verifyRefreshToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.workspaceId).toBe(payload.workspaceId);
    });

    it("should reject access token with wrong secret", async () => {
      const token = await signAccessToken(payload);
      process.env.JWT_ACCESS_SECRET = "wrong-secret";
      
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });
  });
});
