import { describe, it, expect } from "vitest";
import { planLimitsFor, PLAN_LIMITS } from "./plans";

describe("plan limits", () => {
  it("free is the tightest tier", () => {
    expect(PLAN_LIMITS.free).toEqual({ activeWorkflows: 2, runsPerMonth: 100 });
    expect(PLAN_LIMITS.pro.runsPerMonth).toBeGreaterThan(PLAN_LIMITS.free.runsPerMonth);
    expect(PLAN_LIMITS.pro.activeWorkflows).toBe(Infinity);
  });

  it("unknown/empty plans fall back to free (fail safe)", () => {
    expect(planLimitsFor("bogus")).toEqual(PLAN_LIMITS.free);
    expect(planLimitsFor("")).toEqual(PLAN_LIMITS.free);
    expect(planLimitsFor("team")).toBe(PLAN_LIMITS.team);
  });
});
