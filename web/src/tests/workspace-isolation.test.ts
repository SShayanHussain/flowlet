import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([
    ["x-user-id", "user-2"],
    ["x-workspace-id", "ws-2"]
  ])),
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
  }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://flowlet:flowlet@localhost:5432/flowlet",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "mock-secret-access-mock-secret-access",
    JWT_REFRESH_SECRET: "mock-secret-refresh-mock-secret-refresh",
  }
}));

import { GET as GetWorkspace, PATCH as PatchWorkspace } from "../app/api/workspaces/[workspaceId]/route";
import { GET as GetMembers, POST as PostMember } from "../app/api/workspaces/[workspaceId]/members/route";

describe("Cross-tenant isolation tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(method: string, url: string, body?: unknown) {
    return new NextRequest(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "user-2",
        "x-workspace-id": "ws-2",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // Helper to mock the DB responses for getSession and requireMember
  function mockDbForIsolation(isMember: boolean) {
    // 1. getSession DB call (fetch user)
    mockDb.limit.mockResolvedValueOnce([{ id: "user-2", email: "u2@test.com", name: "User 2" }]);
    
    // 2. requireMember DB call
    if (isMember) {
      mockDb.limit.mockResolvedValueOnce([{ role: "member" }]);
    } else {
      mockDb.limit.mockResolvedValueOnce([]); // Not a member
    }
  }

  it("should block user from getting workspace details if not a member", async () => {
    mockDbForIsolation(false);
    
    const req = createRequest("GET", "http://localhost/api/workspaces/ws-1");
    const res = await GetWorkspace(req, { params: Promise.resolve({ workspaceId: "ws-1" }) });
    const json = await res.json();
    
    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("should block user from editing workspace if not a member/owner", async () => {
    mockDbForIsolation(false);
    
    const req = createRequest("PATCH", "http://localhost/api/workspaces/ws-1", { name: "Hacked" });
    const res = await PatchWorkspace(req, { params: Promise.resolve({ workspaceId: "ws-1" }) });
    const json = await res.json();
    
    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("should block user from getting workspace members if not a member", async () => {
    mockDbForIsolation(false);
    
    const req = createRequest("GET", "http://localhost/api/workspaces/ws-1/members");
    const res = await GetMembers(req, { params: Promise.resolve({ workspaceId: "ws-1" }) });
    const json = await res.json();
    
    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("should block user from inviting members if not a member/owner", async () => {
    mockDbForIsolation(false);
    
    const req = createRequest("POST", "http://localhost/api/workspaces/ws-1/members", { email: "user3@test.com" });
    const res = await PostMember(req, { params: Promise.resolve({ workspaceId: "ws-1" }) });
    const json = await res.json();
    
    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("should allow access if user IS a member", async () => {
    mockDbForIsolation(true);
    // getWorkspace DB call
    mockDb.limit.mockResolvedValueOnce([{ id: "ws-2", name: "Workspace 2" }]);
    
    const req = createRequest("GET", "http://localhost/api/workspaces/ws-2");
    const res = await GetWorkspace(req, { params: Promise.resolve({ workspaceId: "ws-2" }) });
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json.data.id).toBe("ws-2");
  });
});
