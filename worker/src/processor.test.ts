import { describe, it, expect, vi } from "vitest";
import { DelayedError } from "bullmq";
import type { StepJobData, StepOutcome, WorkspaceLease } from "@flowlet/shared";
import { makeStepProcessor, type StepJobLike } from "./processor";

const data: StepJobData = { runId: "r1", workspaceId: "ws1", nodeId: "A" };

function fakeJob(): StepJobLike & { delayedTo: number | null } {
  const job = {
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
    delayedTo: null as number | null,
    async moveToDelayed(ts: number) {
      job.delayedTo = ts;
    },
  };
  return job;
}

function fakeLease(grant: boolean) {
  return {
    acquire: vi.fn(async () => grant),
    release: vi.fn(async () => undefined),
  } satisfies WorkspaceLease & { acquire: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
}

const deps = { db: {} as never, queues: { runs: { add: async () => {} }, aiSteps: { add: async () => {} } } };

describe("step processor (fairness wrapper)", () => {
  it("delays the job without consuming an attempt when the tenant is at cap", async () => {
    const lease = fakeLease(false);
    const handle = vi.fn();
    const processor = makeStepProcessor({ deps, lease, handle, delayOnCapMs: 100 });
    const job = fakeJob();

    await expect(processor(job, "tok")).rejects.toBeInstanceOf(DelayedError);
    expect(job.delayedTo).toBeGreaterThan(Date.now() - 1);
    expect(handle).not.toHaveBeenCalled(); // never touched the engine
    expect(lease.release).not.toHaveBeenCalled(); // nothing to release
  });

  it("runs the engine and releases the lease on success", async () => {
    const lease = fakeLease(true);
    const handle = vi.fn(async (): Promise<StepOutcome> => ({ outcome: "completed" }));
    const processor = makeStepProcessor({ deps, lease, handle });

    const result = await processor(fakeJob());
    expect(result.outcome).toBe("completed");
    expect(handle).toHaveBeenCalledOnce();
    expect(lease.release).toHaveBeenCalledWith("ws1", "r1:A");
  });

  it("rethrows a retry outcome (BullMQ backoff) but still releases the lease", async () => {
    const lease = fakeLease(true);
    const handle = vi.fn(async (): Promise<StepOutcome> => ({ outcome: "retry", error: "503" }));
    const processor = makeStepProcessor({ deps, lease, handle });

    await expect(processor(fakeJob())).rejects.toThrow("503");
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it("releases the lease even when the engine throws", async () => {
    const lease = fakeLease(true);
    const handle = vi.fn(async (): Promise<StepOutcome> => {
      throw new Error("boom");
    });
    const processor = makeStepProcessor({ deps, lease, handle });

    await expect(processor(fakeJob())).rejects.toThrow("boom");
    expect(lease.release).toHaveBeenCalledOnce();
  });
});
