import { describe, it, expect } from "vitest";
import { QUEUES } from "@flowlet/shared";
import { processRun } from "./processor";

describe("worker processor", () => {
  it("acknowledges a run job (Phase 1 fills the DAG walk)", async () => {
    const result = await processRun({
      runId: "run-1",
      workflowId: "wf-1",
      workspaceId: "ws-1",
      idempotencyKey: "wf-1:evt-1",
    });
    expect(result.runId).toBe("run-1");
    expect(result.status).toBe("queued");
  });

  it("uses the two-queue topology", () => {
    expect(QUEUES.RUNS).not.toBe(QUEUES.AI_STEPS);
  });
});
