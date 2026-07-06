import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  QUEUES,
  type CronSchedulerQueue,
  type EngineQueues,
  type StepQueue,
} from "@flowlet/shared";

/** BullMQ producer queues (api enqueues; worker consumes). */
export function makeQueues(redisUrl: string, prefix: string) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const runs = new Queue(QUEUES.RUNS, { connection, prefix });
  const aiSteps = new Queue(QUEUES.AI_STEPS, { connection, prefix });
  const cron = new Queue(QUEUES.CRON, { connection, prefix });
  const queues: EngineQueues = {
    runs: runs as unknown as StepQueue,
    aiSteps: aiSteps as unknown as StepQueue,
  };
  return {
    queues,
    cronQueue: cron as unknown as CronSchedulerQueue,
    async close() {
      await runs.close();
      await aiSteps.close();
      await cron.close();
      await connection.quit();
    },
  };
}
