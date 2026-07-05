import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUES, type EngineQueues, type StepQueue } from "@flowlet/shared";

/** BullMQ producer queues (api enqueues; worker consumes). */
export function makeQueues(redisUrl: string, prefix: string) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const runs = new Queue(QUEUES.RUNS, { connection, prefix });
  const aiSteps = new Queue(QUEUES.AI_STEPS, { connection, prefix });
  const queues: EngineQueues = {
    runs: runs as unknown as StepQueue,
    aiSteps: aiSteps as unknown as StepQueue,
  };
  return {
    queues,
    async close() {
      await runs.close();
      await aiSteps.close();
      await connection.quit();
    },
  };
}
