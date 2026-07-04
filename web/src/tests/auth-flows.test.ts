import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// Mock Email
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

import { GET as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";

describe("Auth Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Verify Email", () => {
    it("should return error if token is missing", async () => {
      const req = new NextRequest("http://localhost/api/auth/verify-email");
      const res = await verifyEmail(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return error if token is invalid", async () => {
      mockDb.limit.mockResolvedValueOnce([]); // No user found
      
      const req = new NextRequest("http://localhost/api/auth/verify-email?token=invalid");
      const res = await verifyEmail(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("INVALID_TOKEN");
    });

    it("should verify email on success", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "user-123" }]);
      mockDb.limit.mockResolvedValueOnce([]); // for the update
      
      const req = new NextRequest("http://localhost/api/auth/verify-email?token=valid-token");
      const res = await verifyEmail(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.message).toMatch(/success/i);
    });
  });

  describe("Forgot Password", () => {
    it("should return success even if user not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      
      const req = new NextRequest("http://localhost/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "unknown@example.com" })
      });
      
      const res = await forgotPassword(req);
      expect(res.status).toBe(200);
    });
  });
});
