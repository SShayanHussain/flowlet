import { DelayedError } from "bullmq";
import {
  DEFAULT_STEP_ATTEMPTS,
  handleStepJob,
  type EngineDeps,
  type StepJobData,
  type StepJobMeta,
  type StepOutcome,
  type WorkspaceLease,
} from "@flowlet/shared";

/** The slice of a BullMQ Job the processor touches (fakeable in unit tests). */
export interface StepJobLike {
  data: StepJobData;
  attemptsMade: number;
  opts: { attempts?: number };
  moveToDelayed(timestamp: number, token?: string): Promise<void>;
}

export interface ProcessorOptions {
  deps: EngineDeps;
  lease: WorkspaceLease;
  /** Re-check delay when a tenant is at its concurrency cap. */
  delayOnCapMs?: number;
  /** Injectable for unit tests; defaults to the real engine entrypoint. */
  handle?: (deps: EngineDeps, data: StepJobData, meta: StepJobMeta) => Promise<StepOutcome>;
}

/**
 * BullMQ processor wrapper: fairness first, then the engine.
 *
 * - Tenant at cap → job is DELAYED (not failed, no attempt consumed, no worker
 *   slot held) and re-checked shortly — one workspace's burst can't starve others.
 * - `retry` outcome → rethrow so BullMQ applies exponential backoff.
 * - Lease released in finally; a crashed worker's lease expires via its TTL.
 */
export function makeStepProcessor(opts: ProcessorOptions) {
  const handle = opts.handle ?? handleStepJob;

  return async (job: StepJobLike, token?: string): Promise<StepOutcome> => {
    const data = job.data;
    const member = `${data.runId}:${data.nodeId}`;

    const granted = await opts.lease.acquire(data.workspaceId, member);
    if (!granted) {
      const delay = opts.delayOnCapMs ?? 500 + Math.floor(Math.random() * 1_500);
      await job.moveToDelayed(Date.now() + delay, token);
      throw new DelayedError();
    }

    try {
      const result = await handle(opts.deps, data, {
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? DEFAULT_STEP_ATTEMPTS,
      });
      if (result.outcome === "retry") {
        throw new Error(result.error); // BullMQ retries with backoff
      }
      return result;
    } finally {
      await opts.lease.release(data.workspaceId, member);
    }
  };
}
